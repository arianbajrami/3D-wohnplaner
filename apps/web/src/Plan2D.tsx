import {
  bounds,
  clearance,
  furnitureBox,
  furnitureDirections,
  obstaclesFor,
  overlap,
  wallSideRooms,
  homography,
  multiply,
  pointInPolygon,
  roomArea,
  roomAt,
  roomLabelPoint,
  toCssMatrix3d,
  visibility,
  wallGeometry,
  wallOpenings,
  wallOutline,
  type Furniture,
  type Mat3,
  type Opening,
  type Plan,
  type Point,
  type WallGeometry,
} from "@wohnplaner/model";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FURNITURE_BY_ID, furnitureParts, ROLES } from "./catalog/furniture";
import { resolveFinish } from "./catalog/materials";
import { apartmentColor, fmtArea } from "./format";
import { isFurniture, isRoom, isWall, type Selection } from "./selection";
import { placeFurniture } from "./snap";

export type EditMode = "furnish" | "walls" | "rooms" | "photo";

interface Props {
  plan: Plan;
  setPlan: (p: Plan, withCheckpoint?: boolean) => void;
  checkpoint: () => void;
  mode: EditMode;
  photoUrl?: string;
  showPhoto: boolean;
  photoOpacity: number;
  focus: string;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onFocusRoom: (roomId: string) => void;
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
  | { kind: "calib"; index: number }
  | { kind: "furniture"; id: string; dx: number; dy: number };

const SNAP_PX = 7;
const round = (v: number, step = 0.01) => Math.round(v / step) * step;
const pts = (p: Point[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

export function Plan2D(props: Props) {
  const { plan, setPlan, checkpoint, mode, focus, selection } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ s: 40, tx: 20, ty: 20 });
  const drag = useRef<Drag | null>(null);

  const vis = useMemo(() => visibility(plan, focus), [plan, focus]);
  const rooms = plan.rooms.filter((r) => vis.rooms.has(r.id));
  const geoms = useMemo(() => plan.walls.filter((w) => vis.walls.has(w.id)).map((w) => wallGeometry(plan, w)), [plan, vis]);
  const furniture = plan.furniture.filter(
    (f) => rooms.length === plan.rooms.length || rooms.some((r) => r.polygons.some((p) => pointInPolygon([f.x, f.y], p))),
  );
  // Ist ein einzelner Raum geöffnet, bleiben alle Möbel darin
  const focusRoom = focus.startsWith("room:") ? plan.rooms.find((r) => r.id === focus.slice(5)) : undefined;

  // Entfernte Wände (nur in dieser Variante): Boden läuft durch, im Modus „Wände“ gestrichelt sichtbar
  const removed = useMemo(
    () =>
      plan.walls
        .filter((w) => w.removed)
        .map((w) => {
          const g = wallGeometry(plan, w);
          const sides = wallSideRooms(plan, g);
          const room = plan.rooms.find((r) => r.id === (sides.left ?? sides.right));
          return { g, room, visible: [sides.left, sides.right].some((id) => id && vis.rooms.has(id)) };
        })
        .filter((x) => x.visible),
    [plan, vis],
  );

  // Möbel, die sich mit Wänden oder anderen Möbeln überschneiden (z. B. nach Größenänderung)
  const colliding = useMemo(() => {
    const out = new Set<string>();
    for (const f of furniture) if (obstaclesFor(plan, f).some((o) => overlap(furnitureBox(f), o))) out.add(f.id);
    return out;
  }, [plan, furniture]);

  // Abstände des gewählten Möbels zur nächsten Wand bzw. zum nächsten Möbel
  const selectedFurniture = selection?.kind === "furniture" ? plan.furniture.find((f) => f.id === selection.id) : undefined;
  const clearances = useMemo(() => {
    if (!selectedFurniture || mode !== "furnish") return [];
    const obstacles = obstaclesFor(plan, selectedFurniture);
    const box = furnitureBox(selectedFurniture);
    return furnitureDirections(selectedFurniture).flatMap(({ key, dir }) => {
      const c = clearance(box, dir, obstacles, 6);
      return c ? [{ key, ...c }] : [];
    });
  }, [plan, selectedFurniture, mode]);

  // Größe des Zeichenbereichs verfolgen
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  /** Ansicht auf die sichtbaren Räume einpassen */
  const fit = useCallback(() => {
    const p: Point[] = rooms.length ? rooms.flatMap((r) => r.polygons.flat()) : plan.nodes.map((n) => [n.x, n.y]);
    if (!p.length) return;
    const [x0, y0, x1, y1] = bounds(p);
    const m = 50;
    const s = Math.min((size.w - 2 * m) / (x1 - x0 || 1), (size.h - 2 * m) / (y1 - y0 || 1));
    setView({ s, tx: (size.w - s * (x0 + x1)) / 2, ty: (size.h - s * (y0 + y1)) / 2 });
  }, [rooms, plan.nodes, size]);

  // beim ersten Anzeigen, bei Größenänderung und bei Fokuswechsel einpassen
  const fitted = useRef("");
  useEffect(() => {
    const key = `${plan.meta.name}|${focus}|${size.w}x${size.h}`;
    if (fitted.current !== key && size.w > 0) {
      fitted.current = key;
      fit();
    }
  }, [fit, plan.meta.name, focus, size]);

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

  const toModel = (e: { clientX: number; clientY: number }): Point => {
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
    if (d.kind === "furniture") {
      const f = plan.furniture.find((x) => x.id === d.id);
      if (!f) return;
      const [x, y] = placeFurniture(plan, geoms, f, m[0] - d.dx, m[1] - d.dy, (SNAP_PX * 2) / view.s, focusRoom);
      setPlan({ ...plan, furniture: plan.furniture.map((q) => (q.id === d.id ? { ...q, x, y } : q)) }, false);
    } else if (d.kind === "node") {
      const others = plan.nodes.filter((n) => n.id !== d.id).map((n) => [n.x, n.y] as Point);
      const [x, y] = snap(m, others);
      setPlan({ ...plan, nodes: plan.nodes.map((n) => (n.id === d.id ? { ...n, x, y } : n)) }, false);
    } else if (d.kind === "roomVertex") {
      const others: Point[] = [
        ...plan.nodes.map((n) => [n.x, n.y] as Point),
        ...plan.rooms.flatMap((r) =>
          r.polygons.flatMap((poly, pi) => poly.filter((_, vi) => !(r.id === d.roomId && pi === d.poly && vi === d.vertex))),
        ),
      ];
      const p = snap(m, others);
      setPlan(
        {
          ...plan,
          rooms: plan.rooms.map((r) =>
            r.id !== d.roomId
              ? r
              : { ...r, polygons: r.polygons.map((poly, pi) => (pi !== d.poly ? poly : poly.map((q, vi) => (vi === d.vertex ? p : q)))) },
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
            source: { ...plan.meta.source!, calibration: { ...cal, modelPoints: cal.modelPoints.map((q, i) => (i === d.index ? p : q)) } },
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
  const showRoomLabels = mode !== "furnish" || plan.furniture.length === 0 || view.s > 25;

  return (
    <div
      ref={wrap}
      className={`plan2d mode-${mode}`}
      onPointerDown={(e) => {
        startDrag(e, { kind: "pan", x0: e.clientX, y0: e.clientY, tx0: view.tx, ty0: view.ty });
        if (mode === "furnish") props.onSelect(undefined);
      }}
      onPointerMove={onPointerMove}
      onDoubleClick={(e) => {
        // Doppelklick auf einen Raum zeigt nur diesen Raum
        if (mode !== "furnish") return;
        const r = roomAt(plan, toModel(e));
        if (r) props.onFocusRoom(r.id);
      }}
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
          {/* Räume: Bodenfarbe, sonst Farbe der Wohnung */}
          {rooms.map((r) => {
            const floor = r.finishes?.floor ? resolveFinish(r.finishes.floor).color : apartmentColor(r.apartment);
            const sel = isRoom(selection, r.id);
            return (
              <g key={r.id}>
                {r.polygons.map((poly, i) => (
                  <polygon
                    key={i}
                    points={pts(poly)}
                    fill={floor}
                    fillOpacity={props.showPhoto ? 0.4 : r.finishes?.floor ? 0.85 : 0.55}
                    stroke={sel ? "var(--accent)" : "none"}
                    strokeWidth={sel ? 3 * px : 0}
                    className="room-poly"
                    onPointerDown={(e) => {
                      if (mode !== "furnish") return;
                      e.stopPropagation();
                      props.onSelect({ kind: "room", id: r.id });
                      startDrag(e, { kind: "pan", x0: e.clientX, y0: e.clientY, tx0: view.tx, ty0: view.ty });
                    }}
                  />
                ))}
              </g>
            );
          })}

          {/* Boden unter entfernten Wänden */}
          {removed.map(({ g, room }) => (
            <polygon
              key={`floor-${g.wall.id}`}
              points={pts(wallOutline(g))}
              fill={room?.finishes?.floor ? resolveFinish(room.finishes.floor).color : apartmentColor(room?.apartment)}
              fillOpacity={props.showPhoto ? 0.4 : room?.finishes?.floor ? 0.85 : 0.55}
            />
          ))}

          {/* Wände mit Öffnungen; im Modus „Wände“ anklickbar (zum Entfernen) */}
          {geoms.map((g) => (
            <polygon
              key={g.wall.id}
              data-wall={g.wall.id}
              points={pts(wallOutline(g))}
              className={`wall wall-${g.wall.kind} ${isWall(selection, g.wall.id) ? "wall-selected" : ""} ${mode === "walls" ? "wall-pickable" : ""}`}
              onPointerDown={(e) => {
                if (mode !== "walls") return;
                e.stopPropagation();
                props.onSelect({ kind: "wall", id: g.wall.id });
              }}
            />
          ))}
          {mode === "walls" &&
            removed.map(({ g }) => (
              <polygon
                key={`removed-${g.wall.id}`}
                points={pts(wallOutline(g))}
                className={`wall-removed ${isWall(selection, g.wall.id) ? "wall-selected" : ""}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  props.onSelect({ kind: "wall", id: g.wall.id });
                }}
              >
                <title>entfernte Wand – anklicken zum Wiederherstellen</title>
              </polygon>
            ))}
          {geoms.flatMap((g) => wallOpenings(plan, g.wall.id).map((o) => <OpeningMark key={o.id} g={g} o={o} px={px} />))}

          {/* Möbel */}
          {furniture.map((f) => (
            <FurnitureMark
              key={f.id}
              f={f}
              px={px}
              selected={isFurniture(selection, f.id)}
              colliding={colliding.has(f.id)}
              interactive={mode === "furnish"}
              onPointerDown={(e) => {
                if (mode !== "furnish") return;
                props.onSelect({ kind: "furniture", id: f.id });
                const m = toModel(e);
                startDrag(e, { kind: "furniture", id: f.id, dx: m[0] - f.x, dy: m[1] - f.y });
              }}
            />
          ))}

          {/* Abstände des gewählten Möbels */}
          {clearances.map((c) => {
            const mx = (c.from[0] + c.to[0]) / 2, my = (c.from[1] + c.to[1]) / 2;
            const vertical = Math.abs(c.to[1] - c.from[1]) > Math.abs(c.to[0] - c.from[0]);
            return (
              <g key={c.key} className={`clearance ${c.distance < 0.005 ? "touching" : ""}`}>
                <line x1={c.from[0]} y1={c.from[1]} x2={c.to[0]} y2={c.to[1]} />
                <circle cx={c.to[0]} cy={c.to[1]} r={2.5 * px} />
                <text
                  x={mx + (vertical ? 6 * px : 0)}
                  y={my + (vertical ? 4 * px : -5 * px)}
                  fontSize={12 * px}
                  textAnchor={vertical ? "start" : "middle"}
                >
                  {c.distance < 0.005 ? "bündig" : `${Math.round(c.distance * 100)} cm`}
                </text>
              </g>
            );
          })}

          {/* Raumbeschriftung */}
          {showRoomLabels &&
            rooms.map((r) => {
              const [x, y] = roomLabelPoint(r);
              const area = roomArea(r);
              const dev = r.targetArea ? (area - r.targetArea) / r.targetArea : undefined;
              return (
                <g key={r.id} className="room-label" fontSize={13 * px}>
                  <text x={x} y={y - 8 * px} textAnchor="middle" fontWeight={600}>{r.name}</text>
                  <text x={x} y={y + 8 * px} textAnchor="middle" className={dev !== undefined && Math.abs(dev) > 0.03 ? "warn" : ""}>
                    {fmtArea(area)}
                    {r.targetArea && mode !== "furnish" ? ` (Plan ${fmtArea(r.targetArea)})` : ""}
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
            rooms.flatMap((r) =>
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

function FurnitureMark(props: {
  f: Furniture;
  px: number;
  selected: boolean;
  colliding: boolean;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const { f, px } = props;
  // Teile von unten nach oben zeichnen, damit die Draufsicht stimmt
  const parts = useMemo(
    () => furnitureParts(f.type, { w: f.width, d: f.depth, h: f.height }).sort((a, b) => a.z1 - b.z1),
    [f.type, f.width, f.depth, f.height],
  );
  const label = f.name ?? FURNITURE_BY_ID.get(f.type)?.name ?? f.type;
  const fontSize = Math.min(11 * px, f.depth * 0.3, f.width * 0.18);
  return (
    <g
      transform={`translate(${f.x},${f.y}) rotate(${f.rotation})`}
      className={`furniture ${props.interactive ? "interactive" : ""} ${props.selected ? "selected" : ""} ${props.colliding ? "colliding" : ""}`}
      onPointerDown={props.onPointerDown}
    >
      {parts.map((p, i) => (
        <rect
          key={i}
          x={p.x0}
          y={p.y0}
          width={p.x1 - p.x0}
          height={p.y1 - p.y0}
          rx={p.shape === "cylinder" ? (p.x1 - p.x0) / 2 : 0}
          fill={p.role === "glass" ? "none" : resolveFinish(f.finishes[p.role] ?? ROLES[p.role].default).color}
          className="furniture-part"
        />
      ))}
      <rect x={-f.width / 2} y={-f.depth / 2} width={f.width} height={f.depth} className="furniture-outline" />
      {/* Vorderkante markieren */}
      <line x1={-f.width / 2} y1={f.depth / 2} x2={f.width / 2} y2={f.depth / 2} className="furniture-front" />
      {fontSize > 4 * px && (
        <text
          y={fontSize * 0.35}
          textAnchor="middle"
          fontSize={fontSize}
          className="furniture-label"
          // Beschriftung nie kopfüber anzeigen
          transform={f.rotation % 360 > 90 && f.rotation % 360 <= 270 ? "rotate(180)" : undefined}
        >
          {label}
        </text>
      )}
    </g>
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
