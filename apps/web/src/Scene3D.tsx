import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { wallGeometry, wallOpenings, type Plan, type WallGeometry } from "@wohnplaner/model";
import { useMemo } from "react";
import * as THREE from "three";
import { apartmentColor } from "./format";

interface Props {
  plan: Plan;
  focus: string;
  /** Wände auf Brusthöhe abschneiden (Puppenhaus-Ansicht) */
  cutaway: boolean;
  selectedRoom?: string;
  onSelectRoom: (id: string | undefined) => void;
}

const CUT_HEIGHT = 1.1;

/**
 * 3D-Szene, rein aus dem Modell erzeugt. Koordinaten: Modell (x, y) → three.js (x, z), Höhe = y.
 */
export function Scene3D({ plan, focus, cutaway, selectedRoom, onSelectRoom }: Props) {
  const bounds = useMemo(() => {
    const xs = plan.nodes.map((n) => n.x), ys = plan.nodes.map((n) => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return { cx, cz, span };
  }, [plan.nodes]);

  return (
    <Canvas
      shadows
      camera={{ position: [bounds.cx, bounds.span * 0.95, bounds.cz + bounds.span * 0.75], fov: 45, near: 0.05, far: 500 }}
      onPointerMissed={() => onSelectRoom(undefined)}
    >
      <color attach="background" args={["#eef0f2"]} />
      <hemisphereLight args={["#ffffff", "#b9b2a6", 2.2]} />
      <directionalLight
        position={[bounds.cx - 4, 30, bounds.cz + 6]}
        intensity={1.2}
        shadow-bias={-0.0005}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-bounds.span}
        shadow-camera-right={bounds.span}
        shadow-camera-top={bounds.span}
        shadow-camera-bottom={-bounds.span}
      />
      <Floors plan={plan} focus={focus} selectedRoom={selectedRoom} onSelectRoom={onSelectRoom} />
      <Walls plan={plan} cutaway={cutaway} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.cx, -0.02, bounds.cz]} receiveShadow>
        <planeGeometry args={[bounds.span * 3, bounds.span * 3]} />
        <meshStandardMaterial color="#d7d9d4" />
      </mesh>
      <OrbitControls makeDefault target={[bounds.cx, 0, bounds.cz]} maxPolarAngle={Math.PI / 2 - 0.05} />
    </Canvas>
  );
}

function Floors({ plan, focus, selectedRoom, onSelectRoom }: Omit<Props, "cutaway">) {
  const shapes = useMemo(
    () =>
      plan.rooms.map((r) => ({
        room: r,
        geometries: r.polygons.map((poly) => {
          // Shape liegt in der XY-Ebene; nach Drehung um −90° um X wird (x, −y) zu (x, 0, y).
          const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, -y)));
          return new THREE.ShapeGeometry(shape);
        }),
      })),
    [plan.rooms],
  );
  return (
    <>
      {shapes.map(({ room, geometries }) => {
        const dim = focus !== "all" && room.apartment !== focus;
        const color = new THREE.Color(apartmentColor(room.apartment));
        if (room.id === selectedRoom) color.offsetHSL(0, 0.1, -0.15);
        return geometries.map((g, i) => (
          <mesh
            key={`${room.id}-${i}`}
            geometry={g}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.001, 0]}
            receiveShadow
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom(room.id);
            }}
          >
            {/* key erzwingt neues Material, da sich "transparent" nicht live umschalten lässt */}
            <meshStandardMaterial key={dim ? "dim" : "full"} color={color} transparent={dim} opacity={dim ? 0.3 : 1} />
          </mesh>
        ));
      })}
    </>
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

function Walls({ plan, cutaway }: { plan: Plan; cutaway: boolean }) {
  const items = useMemo(
    () =>
      plan.walls.map((w) => {
        const g = wallGeometry(plan, w);
        const height = cutaway ? Math.min(CUT_HEIGHT, g.height) : g.height;
        return { g, ...wallPieces(plan, g, height) };
      }),
    [plan, cutaway],
  );
  return (
    <>
      {items.map(({ g, solid, glass }) => {
        const rotY = -Math.atan2(g.dir[1], g.dir[0]);
        const place = (p: Piece, depth: number) => {
          const mid = (p.a0 + p.a1) / 2;
          return {
            position: [g.start[0] + g.dir[0] * mid, (p.z0 + p.z1) / 2, g.start[1] + g.dir[1] * mid] as [number, number, number],
            rotation: [0, rotY, 0] as [number, number, number],
            args: [p.a1 - p.a0, p.z1 - p.z0, depth] as [number, number, number],
          };
        };
        const color = g.wall.kind === "exterior" ? "#d8d2c8" : "#f1ede6";
        return (
          <group key={g.wall.id}>
            {solid.map((p, i) => {
              const { args, ...t } = place(p, g.wall.thickness);
              return (
                <mesh key={i} {...t} castShadow receiveShadow>
                  <boxGeometry args={args} />
                  <meshStandardMaterial color={color} />
                </mesh>
              );
            })}
            {glass.map((p, i) => {
              const { args, ...t } = place(p, 0.02);
              return (
                <mesh key={`g${i}`} {...t}>
                  <boxGeometry args={args} />
                  <meshStandardMaterial color="#9cc7e8" transparent opacity={0.35} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </>
  );
}
