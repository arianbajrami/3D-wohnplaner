import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  bounds,
  pointInPolygon,
  visibility,
  wallGeometry,
  wallOpenings,
  wallSideRooms,
  type Furniture,
  type Plan,
  type WallGeometry,
  type WallSide,
} from "@wohnplaner/model";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { furnitureParts, ROLES } from "./catalog/furniture";
import { DEFAULT_WALL, EXTERIOR_WALL } from "./catalog/materials";
import { isFurniture, isRoom, type Selection } from "./selection";
import { finishMaterial } from "./textures";

interface Props {
  plan: Plan;
  focus: string;
  /** Wände auf Brusthöhe abschneiden (Puppenhaus-Ansicht) */
  cutaway: boolean;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onFocusRoom: (roomId: string) => void;
  /** Farbe, mit der ein Klick auf eine Wandseite streicht (Malmodus); undefined = aus */
  paint?: string;
  onPaintWall: (wallId: string, side: WallSide) => void;
}

const CUT_HEIGHT = 1.1;

/**
 * 3D-Szene, rein aus dem Modell erzeugt. Koordinaten: Modell (x, y) → three.js (x, z), Höhe = y.
 */
export function Scene3D(props: Props) {
  const { plan, focus } = props;
  const vis = useMemo(() => visibility(plan, focus), [plan, focus]);

  const box = useMemo(() => {
    const rooms = plan.rooms.filter((r) => vis.rooms.has(r.id));
    const pts = rooms.length ? rooms.flatMap((r) => r.polygons.flat()) : plan.nodes.map((n) => [n.x, n.y] as [number, number]);
    const [x0, y0, x1, y1] = bounds(pts);
    return { cx: (x0 + x1) / 2, cz: (y0 + y1) / 2, span: Math.max(x1 - x0, y1 - y0, 3) };
  }, [plan, vis]);

  return (
    <Canvas shadows camera={{ fov: 45, near: 0.05, far: 500 }} onPointerMissed={() => props.onSelect(undefined)}>
      <color attach="background" args={["#eef0f2"]} />
      <hemisphereLight args={["#ffffff", "#b9b2a6", 2.2]} />
      <directionalLight
        position={[box.cx - 4, 30, box.cz + 6]}
        intensity={1.2}
        shadow-bias={-0.0005}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <CameraRig focusKey={focus} {...box} />
      <Floors {...props} visibleRooms={vis.rooms} />
      <Walls {...props} visibleWalls={vis.walls} />
      <FurnitureMeshes {...props} visibleRooms={vis.rooms} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[box.cx, -0.02, box.cz]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#d7d9d4" />
      </mesh>
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  );
}

/** Setzt Kamera und Drehpunkt neu, wenn sich der Fokus (Geschoss/Wohnung/Raum) ändert. */
function CameraRig({ focusKey, cx, cz, span }: { focusKey: string; cx: number; cz: number; span: number }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    camera.position.set(cx, span * 0.95 + 1.5, cz + span * 0.75 + 1);
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (c) {
      c.target.set(cx, 0, cz);
      c.update();
    } else camera.lookAt(cx, 0, cz);
    // nur bei Fokuswechsel neu ausrichten, nicht bei jeder Änderung am Modell
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, controls]);
  return null;
}

function Floors({ plan, selection, onSelect, onFocusRoom, visibleRooms }: Props & { visibleRooms: Set<string> }) {
  const items = useMemo(
    () =>
      plan.rooms
        .filter((r) => visibleRooms.has(r.id))
        .map((r) => ({
          room: r,
          // Shape liegt in der XY-Ebene; nach Drehung um −90° um X wird (x, −y) zu (x, 0, y).
          // Die UV-Koordinaten der ShapeGeometry sind damit Meter → Texturen kacheln maßstäblich.
          geometries: r.polygons.map((poly) => new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y))))),
        })),
    [plan.rooms, visibleRooms],
  );
  return (
    <>
      {items.map(({ room, geometries }) =>
        geometries.map((g, i) => (
          <mesh
            key={`${room.id}-${i}`}
            geometry={g}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.001, 0]}
            receiveShadow
            material={finishMaterial(room.finishes?.floor ?? "#ddd6c8", { world: true })}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: "room", id: room.id });
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onFocusRoom(room.id);
            }}
          >
            {isRoom(selection, room.id) && <Outline geometry={g} />}
          </mesh>
        )),
      )}
    </>
  );
}

function Outline({ geometry }: { geometry: THREE.BufferGeometry }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  return (
    <lineSegments geometry={edges} position={[0, 0, 0.01]}>
      <lineBasicMaterial color="#d2552d" linewidth={2} />
    </lineSegments>
  );
}

interface Piece {
  a0: number;
  a1: number;
  z0: number;
  z1: number;
}

/** Zerlegt eine Wand an ihren Öffnungen in Quader – ohne CSG. */
function wallPieces(plan: Plan, g: WallGeometry, height: number): { solid: Piece[]; glass: Piece[] } {
  const ext = g.wall.thickness / 2; // Wandenden überlappen sich an den Ecken
  const solid: Piece[] = [], glass: Piece[] = [];
  let cursor = -ext;
  for (const o of wallOpenings(plan, g.wall.id)) {
    const s = o.offset - o.width / 2, e = o.offset + o.width / 2;
    if (s > cursor) solid.push({ a0: cursor, a1: s, z0: 0, z1: height });
    if (o.sill > 0) solid.push({ a0: s, a1: e, z0: 0, z1: Math.min(o.sill, height) });
    const top = o.sill + o.height;
    if (top < height) solid.push({ a0: s, a1: e, z0: top, z1: height });
    if (o.kind === "window" && o.sill < height) glass.push({ a0: s, a1: e, z0: o.sill, z1: Math.min(top, height) });
    cursor = Math.max(cursor, e);
  }
  solid.push({ a0: cursor, a1: g.length + ext, z0: 0, z1: height });
  return { solid: solid.filter((p) => p.a1 - p.a0 > 1e-3 && p.z1 - p.z0 > 1e-3), glass };
}

const CAP = new THREE.MeshStandardMaterial({ color: "#e4dfd6" });

function Walls({ plan, cutaway, visibleWalls, paint, onPaintWall }: Props & { visibleWalls: Set<string> }) {
  const items = useMemo(
    () =>
      plan.walls
        .filter((w) => visibleWalls.has(w.id))
        .map((w) => {
          const g = wallGeometry(plan, w);
          const height = cutaway ? Math.min(CUT_HEIGHT, g.height) : g.height;
          const rooms = wallSideRooms(plan, g);
          const sideFinish = (side: WallSide) => {
            const own = w.finishes?.[side];
            if (own) return own;
            const room = plan.rooms.find((r) => r.id === rooms[side]);
            if (room) return room.finishes?.walls ?? DEFAULT_WALL;
            return w.kind === "exterior" ? EXTERIOR_WALL : DEFAULT_WALL;
          };
          // Reihenfolge der Box-Flächen: +x, −x, +y (oben), −y, +z (= linke Wandseite), −z (= rechte)
          const materials = [CAP, CAP, CAP, CAP, finishMaterial(sideFinish("left")), finishMaterial(sideFinish("right"))];
          return { g, materials, ...wallPieces(plan, g, height) };
        }),
    [plan, cutaway, visibleWalls],
  );

  const onClick = (wallId: string) => (e: ThreeEvent<MouseEvent>) => {
    if (!paint) return;
    e.stopPropagation();
    const idx = e.face?.materialIndex;
    if (idx === 4) onPaintWall(wallId, "left");
    else if (idx === 5) onPaintWall(wallId, "right");
  };

  return (
    <>
      {items.map(({ g, solid, glass, materials }) => {
        const rotY = -Math.atan2(g.dir[1], g.dir[0]);
        const place = (p: Piece, depth: number) => {
          const mid = (p.a0 + p.a1) / 2;
          return {
            position: [g.start[0] + g.dir[0] * mid, (p.z0 + p.z1) / 2, g.start[1] + g.dir[1] * mid] as [number, number, number],
            rotation: [0, rotY, 0] as [number, number, number],
            args: [p.a1 - p.a0, p.z1 - p.z0, depth] as [number, number, number],
          };
        };
        return (
          <group key={g.wall.id}>
            {solid.map((p, i) => {
              const { args, ...t } = place(p, g.wall.thickness);
              return (
                <mesh key={i} {...t} castShadow receiveShadow material={materials} onClick={onClick(g.wall.id)}>
                  <boxGeometry args={args} />
                </mesh>
              );
            })}
            {glass.map((p, i) => {
              const { args, ...t } = place(p, 0.02);
              return (
                <mesh key={`g${i}`} {...t} material={finishMaterial("#9cc7e8", { glass: true })}>
                  <boxGeometry args={args} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </>
  );
}

function FurnitureMeshes({ plan, selection, onSelect, paint, cutaway, visibleRooms }: Props & { visibleRooms: Set<string> }) {
  const visible = useMemo(() => {
    const rooms = plan.rooms.filter((r) => visibleRooms.has(r.id));
    // In der Puppenhaus-Ansicht würden Oberschränke über den abgeschnittenen Wänden schweben
    const items = cutaway ? plan.furniture.filter((f) => f.elevation < CUT_HEIGHT) : plan.furniture;
    if (rooms.length === plan.rooms.length) return items;
    return items.filter((f) => rooms.some((r) => r.polygons.some((poly) => pointInPolygon([f.x, f.y], poly))));
  }, [plan, visibleRooms, cutaway]);
  return (
    <>
      {visible.map((f) => (
        <FurnitureMesh key={f.id} f={f} selected={isFurniture(selection, f.id)} onSelect={() => !paint && onSelect({ kind: "furniture", id: f.id })} />
      ))}
    </>
  );
}

function FurnitureMesh({ f, selected, onSelect }: { f: Furniture; selected: boolean; onSelect: () => void }) {
  const parts = useMemo(() => furnitureParts(f.type, { w: f.width, d: f.depth, h: f.height }), [f.type, f.width, f.depth, f.height]);
  return (
    <group
      position={[f.x, f.elevation, f.y]}
      rotation={[0, (-f.rotation * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {parts.map((p, i) => {
        const finish = f.finishes[p.role] ?? ROLES[p.role].default;
        const mat = finishMaterial(finish, { glass: p.role === "glass" });
        const [w, h, d] = [p.x1 - p.x0, p.z1 - p.z0, p.y1 - p.y0];
        const pos: [number, number, number] = [(p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, (p.y0 + p.y1) / 2];
        return (
          <mesh key={i} position={pos} material={mat} castShadow={p.role !== "glass"} receiveShadow>
            {p.shape === "cylinder" ? <cylinderGeometry args={[w / 2, w / 2, h, 24]} /> : <boxGeometry args={[w, h, d]} />}
          </mesh>
        );
      })}
      {selected && (
        <mesh position={[0, f.height / 2, 0]}>
          <boxGeometry args={[f.width + 0.04, f.height + 0.04, f.depth + 0.04]} />
          <meshBasicMaterial color="#d2552d" wireframe />
        </mesh>
      )}
    </group>
  );
}
