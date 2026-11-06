import {
  homography,
  multiply,
  roomArea,
  roomLabelPoint,
  toCssMatrix3d,
  wallGeometry,
  wallOpenings,
  wallOutline,
  type Mat3,
  type Opening,
  type Plan,
  type Point,
  type WallGeometry,
} from "@wohnplaner/model";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apartmentColor, fmtArea } from "./format";

export type EditMode = "view" | "walls" | "rooms" | "photo";

interface Props {
  plan: Plan;
  setPlan: (p: Plan, withCheckpoint?: boolean) => void;
  checkpoint: () => void;
  mode: EditMode;
  photoUrl?: string;
  showPhoto: boolean;
  photoOpacity: number;
  focus: string;
  selectedRoom?: string;
  onSelectRoom: (id: string | undefined) => void;
}

interface View {
  s: number; // Pixel pro Meter
  tx: number;
  ty: number;
}

type Drag =
  | { kind: "pan"; x0: number; y0: number; tx0: number; ty0: number }
  | { kind: "node"; id: string }
  | { kind: "roomVertex"; roomId: string; poly: number; vertex: number }
  | { kind: "calib"; index: number };

const SNAP_PX = 7;
const round = (v: number, step = 0.01) => Math.round(v / step) * step;
const pts = (p: Point[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

export function Plan2D(props: Props) {
  const { plan, setPlan, checkpoint, mode, focus } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ s: 40, tx: 20, ty: 20 });
  const drag = useRef<Drag | null>(null);

  const geoms = useMemo(() => plan.walls.map((w) => wallGeometry(plan, w)), [plan]);

  // Größe des Zeichenbereichs verfolgen
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!plan.nodes.length) return;
    const xs = plan.nodes.map((n) => n.x), ys = plan.nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const m = 40;
    const s = Math.min((size.w - 2 * m) / (x1 - x0 || 1), (size.h - 2 * m) / (y1 - y0 || 1));
    setView({ s, tx: (size.w - s * (x0 + x1)) / 2, ty: (size.h - s * (y0 + y1)) / 2 });
  }, [plan.nodes, size]);

  // beim ersten Anzeigen und bei Größenänderung einpassen
  const fitted = useRef("");
  useEffect(() => {
    const key = `${plan.meta.name}|${size.w}x${size.h}`;
    if (fitted.current !== key && size.w > 0) {
      fitted.current = key;
      fit();
    }
  }, [fit, plan.meta.name, size]);

  // Mausrad-Zoom um den Cursor
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const f = Math.exp(-e.deltaY * 0.0015);
      setView((v) => ({ s: v.s * f, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (f: number) =>
    setView((v) => ({ s: v.s * f, tx: size.w / 2 - (size.w / 2 - v.tx) * f, ty: size.h / 2 - (size.h / 2 - v.ty) * f }));

  const toModel = (e: React.PointerEvent): Point => {
    const r = wrap.current!.getBoundingClientRect();
    return [(e.clientX - r.left - view.tx) / view.s, (e.clientY - r.top - view.ty) / view.s];
  };

  /** Rastet auf 1 cm und richtet sich an anderen Punkten aus, wenn man nah genug dran ist. */
  const snap = ([x, y]: Point, others: Point[]): Point => {
    let sx = round(x), sy = round(y);
    let bx = SNAP_PX / view.s, by = SNAP_PX / view.s;
    for (const [ox, oy] of others) {
      if (Math.abs(ox - x) < bx) { bx = Math.abs(ox - x); sx = ox; }
      if (Math.abs(oy - y) < by) { by = Math.abs(oy - y); sy = oy; }
    }
    return [sx, sy];
  };

  const startDrag = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    if (d.kind !== "pan") checkpoint();
    drag.current = d;
    wrap.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({ ...v, tx: d.tx0 + e.clientX - d.x0, ty: d.ty0 + e.clientY - d.y0 }));
      return;
    }
    const m = toModel(e);
    if (d.kind === "node") {
      const others = plan.nodes.filter((n) => n.id !== d.id).map((n) => [n.x, n.y] as Point);
      const [x, y] = snap(m, others);
      setPlan({ ...plan, nodes: plan.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)) }, false);
    } else if (d.kind === "roomVertex") {
      const others: Point[] = [
        ...plan.nodes.map((n) => [n.x, n.y] as Point),
        ...plan.rooms.flatMap((r) =>
          r.polygons.flatMap((poly, pi) =>
            poly.filter((_, vi) => !(r.id === d.roomId && pi === d.poly && vi === d.vertex)),
          ),
        ),
      ];
      const p = snap(m, others);
      setPlan(
        {
          ...plan,
          rooms: plan.rooms.map((r) =>
            r.id !== d.roomId
              ? r
              : {
                  ...r,
                  polygons: r.polygons.map((poly, pi) =>
                    pi !== d.poly ? poly : poly.map((q, vi) => (vi === d.vertex ? p : q)),
                  ),
                },
          ),
        },
        false,
      );
    } else if (d.kind === "calib") {
      const cal = plan.meta.source?.calibration;
      if (!cal) return;
      const p: Point = [round(m[0]), round(m[1])];
      setPlan(
        {
          ...plan,
          meta: {
            ...plan.meta,
            source: {
              ...plan.meta.source!,
              calibration: { ...cal, modelPoints: cal.modelPoints.map((q, i) => (i === d.index ? p : q)) },
            },
          },
        },
        false,
      );
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  // Foto per Homographie unter den Plan legen: Bildpixel → Modell (Meter) → Bildschirm
  const photo = useMemo(() => {
    const src = plan.meta.source;
    if (!props.photoUrl || !src?.calibration || !src.imageSize) return undefined;
    const imgToModel = homography(src.calibration.imagePoints, src.calibration.modelPoints);
    return { imgToModel, size: src.imageSize };
  }, [plan.meta.source, props.photoUrl]);
  const viewMat: Mat3 = [view.s, 0, view.tx, 0, view.s, view.ty, 0, 0, 1];

  const px = 1 / view.s; // ein Bildschirmpixel in Metern
  const dimmed = (apt?: string) => focus !== "all" && apt !== focus;

  return (
    <div
      ref={wrap}
      className={`plan2d mode-${mode}`}
      onPointerDown={(e) => {
        startDrag(e, { kind: "pan", x0: e.clientX, y0: e.clientY, tx0: view.tx, ty0: view.ty });
        if (mode === "view") props.onSelectRoom(undefined);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {photo && props.showPhoto && (
        <img
          className="plan-photo"
          src={props.photoUrl}
          alt="Originalgrundriss"
          draggable={false}
          style={{
            width: photo.size[0],
            height: photo.size[1],
            opacity: props.photoOpacity,
            transform: toCssMatrix3d(multiply(viewMat, photo.imgToModel)),
          }}
        />
      )}
      <svg width={size.w} height={size.h}>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.s})`}>
          {/* Räume */}
          {plan.rooms.map((r) => {
            const color = apartmentColor(r.apartment);
            const sel = r.id === props.selectedRoom;
            return (
              <g key={r.id} opacity={dimmed(r.apartment) ? 0.25 : 1}>
                {r.polygons.map((poly, i) => (
                  <polygon
                    key={i}
                    points={pts(poly)}
                    fill={color}
                    fillOpacity={props.showPhoto ? 0.35 : 0.55}
                    stroke={sel ? "var(--accent)" : "none"}
                    strokeWidth={sel ? 3 * px : 0}
                    className="room-poly"
                    onPointerDown={(e) => {
                      if (mode !== "view") return;
                      e.stopPropagation();
                      props.onSelectRoom(r.id);
                    }}
                  />
                ))}
              </g>
            );
          })}

          {/* Wände mit Öffnungen */}
          {geoms.map((g) => (
            <polygon key={g.wall.id} points={pts(wallOutline(g))} className={`wall wall-${g.wall.kind}`} />
          ))}
          {geoms.flatMap((g) => wallOpenings(plan, g.wall.id).map((o) => <OpeningMark key={o.id} g={g} o={o} px={px} />))}

          {/* Raumbeschriftung */}
          {plan.rooms.map((r) => {
            const [x, y] = roomLabelPoint(r);
            const area = roomArea(r);
            const dev = r.targetArea ? (area - r.targetArea) / r.targetArea : undefined;
            return (
              <g key={r.id} className="room-label" opacity={dimmed(r.apartment) ? 0.3 : 1} fontSize={13 * px}>
                <text x={x} y={y - 8 * px} textAnchor="middle" fontWeight={600}>{r.name}</text>
                <text x={x} y={y + 8 * px} textAnchor="middle" className={dev !== undefined && Math.abs(dev) > 0.03 ? "warn" : ""}>
                  {fmtArea(area)}
                  {r.targetArea ? ` (Plan ${fmtArea(r.targetArea)})` : ""}
                </text>
              </g>
            );
          })}

          {/* Griffe zum Bearbeiten */}
          {mode === "walls" &&
            plan.nodes.map((n) => (
              <circle key={n.id} cx={n.x} cy={n.y} r={6 * px} className="handle" onPointerDown={(e) => startDrag(e, { kind: "node", id: n.id })} />
            ))}
          {mode === "rooms" &&
            plan.rooms.flatMap((r) =>
              r.polygons.flatMap((poly, pi) =>
                poly.map(([x, y], vi) => (
                  <rect
                    key={`${r.id}-${pi}-${vi}`}
                    x={x - 5 * px}
                    y={y - 5 * px}
                    width={10 * px}
                    height={10 * px}
                    className="handle handle-room"
                    onPointerDown={(e) => startDrag(e, { kind: "roomVertex", roomId: r.id, poly: pi, vertex: vi })}
                  />
                )),
              ),
            )}
          {mode === "photo" &&
            plan.meta.source?.calibration?.modelPoints.map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={9 * px} className="handle handle-calib" onPointerDown={(e) => startDrag(e, { kind: "calib", index: i })} />
                <text x={x + 12 * px} y={y - 12 * px} fontSize={12 * px} className="calib-label">Fotopunkt {i + 1}</text>
              </g>
            ))}
        </g>
      </svg>
      <div className="zoom-buttons">
        <button onClick={() => zoomBy(1.25)} onPointerDown={(e) => e.stopPropagation()} title="Vergrößern">+</button>
        <button onClick={() => zoomBy(0.8)} onPointerDown={(e) => e.stopPropagation()} title="Verkleinern">−</button>
        <button onClick={fit} onPointerDown={(e) => e.stopPropagation()} title="Einpassen">⤢</button>
      </div>
      <div className="scale-info">{(100 / view.s).toFixed(2).replace(".", ",")} m pro 100 px</div>
    </div>
  );
}

function OpeningMark({ g, o, px }: { g: WallGeometry; o: Opening; px: number }) {
  const [sx, sy] = g.start, [dx, dy] = g.dir, [nx, ny] = g.normal;
  const at = (along: number, across: number): Point => [sx + dx * along + nx * across, sy + dy * along + ny * across];
  const h = g.wall.thickness / 2;
  const a = o.offset - o.width / 2, b = o.offset + o.width / 2;
  const gap = [at(a, h + px), at(b, h + px), at(b, -h - px), at(a, -h - px)];

  let detail: React.ReactNode = null;
  if (o.kind === "window") {
    const q = h * 0.3;
    detail = (
      <>
        <polyline points={pts([at(a, q), at(b, q)])} className="window-line" />
        <polyline points={pts([at(a, -q), at(b, -q)])} className="window-line" />
        <polyline points={pts([at(a, 0), at(b, 0)])} className="window-glass" />
      </>
    );
  } else if (o.kind === "door") {
    if (o.hinge && o.swing) {
      // Türblatt und Öffnungsbogen
      const side = o.swing === "left" ? 1 : -1;
      const hingeAlong = o.hinge === "a" ? a : b;
      const otherAlong = o.hinge === "a" ? b : a;
      const hinge = at(hingeAlong, side * h);
      const leafEnd = at(hingeAlong, side * (h + o.width));
      const closed = at(otherAlong, side * h);
      const sweep = (o.hinge === "a") === (side === 1) ? 1 : 0;
      detail = (
        <>
          <polyline points={pts([hinge, leafEnd])} className="door-leaf" />
          <path d={`M ${leafEnd[0]} ${leafEnd[1]} A ${o.width} ${o.width} 0 0 ${sweep} ${closed[0]} ${closed[1]}`} className="door-arc" />
        </>
      );
    } else {
      detail = <polyline points={pts([at(a, 0), at(b, 0)])} className="door-sill" />;
    }
  }
  return (
    <g>
      <polygon points={pts(gap)} className={`opening opening-${o.kind}`} />
      {detail}
    </g>
  );
}
