import { useFrame, useThree } from "@react-three/fiber";
import type { Furniture, Plan, WallGeometry } from "@wohnplaner/model";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { dragTarget } from "./snap";

// ---------------------------------------------------------------- Möbel in 3D ziehen

export interface DragState {
  id: string;
  dx: number;
  dz: number;
  pointerId: number;
}

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Schnittpunkt eines Strahls mit dem Boden (y = 0) */
export function floorHit(ray: THREE.Ray): THREE.Vector3 | undefined {
  return ray.intersectPlane(FLOOR, new THREE.Vector3()) ?? undefined;
}

/**
 * Verfolgt einen laufenden Ziehvorgang: Zeiger → Strahl → Bodenpunkt → Möbelposition,
 * mit demselben Einrasten an Wänden wie im 2D-Plan. Kamera-Steuerung ist währenddessen aus.
 */
export function FurnitureDragger(props: {
  drag: React.RefObject<DragState | null>;
  plan: Plan;
  geoms: WallGeometry[];
  setPlan: (p: Plan, withCheckpoint?: boolean) => void;
}) {
  const { camera, gl, controls } = useThree();
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const ctl = () => controls as unknown as { enabled: boolean } | null;

    const move = (e: PointerEvent) => {
      const d = latest.current.drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (ctl()) ctl()!.enabled = false;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = floorHit(ray.ray);
      if (!hit) return;
      const { plan, geoms, setPlan } = latest.current;
      const f = plan.furniture.find((x) => x.id === d.id);
      if (!f) return;
      const [x, y] = dragTarget(plan, geoms, f, hit.x - d.dx, hit.z - d.dz, 0.15);
      setPlan({ ...plan, furniture: plan.furniture.map((q) => (q.id === d.id ? { ...q, x, y } : q)) }, false);
    };
    const up = (e: PointerEvent) => {
      const d = latest.current.drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      latest.current.drag.current = null;
      if (ctl()) ctl()!.enabled = true;
    };
    el.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [camera, gl, controls]);
  return null;
}

// ---------------------------------------------------------------- Begehen in Augenhöhe

export const EYE_HEIGHT = 1.6;
const RADIUS = 0.22;

/** Rechteckige Hindernisse am Boden (Wandstücke ohne Tür/Durchgang), in Modell-Koordinaten */
export interface Blocker {
  cx: number;
  cy: number;
  dir: [number, number];
  halfLen: number;
  halfThick: number;
}

/** Eingaben für die Bewegung, auch von den Bildschirm-Knöpfen (Tablet) */
export const walkInput = { forward: 0, strafe: 0, turn: 0 };

function blocked(x: number, y: number, blockers: Blocker[], furniture: Furniture[]): boolean {
  for (const b of blockers) {
    const rx = x - b.cx, ry = y - b.cy;
    const a = rx * b.dir[0] + ry * b.dir[1];
    const n = -rx * b.dir[1] + ry * b.dir[0];
    if (Math.abs(a) < b.halfLen + RADIUS && Math.abs(n) < b.halfThick + RADIUS) return true;
  }
  // hohe Möbel (Schränke, Regale) sind auch Hindernisse, flache (Teppich, Tisch) nicht
  for (const f of furniture) {
    if (f.height < 1.2 || f.elevation > 0.5) continue;
    const r = (f.rotation * Math.PI) / 180, rx = x - f.x, ry = y - f.y;
    const a = rx * Math.cos(r) + ry * Math.sin(r), n = -rx * Math.sin(r) + ry * Math.cos(r);
    if (Math.abs(a) < f.width / 2 + RADIUS * 0.5 && Math.abs(n) < f.depth / 2 + RADIUS * 0.5) return true;
  }
  return false;
}

/**
 * Ego-Perspektive: W/S oder ↑/↓ vor/zurück, A/D seitwärts, ←/→ drehen, Ziehen mit der Maus
 * schaut sich um, Umschalt = schneller. Wände und hohe Möbel halten auf.
 */
export function WalkControls({ start, blockers, furniture }: { start: [number, number]; blockers: Blocker[]; furniture: Furniture[] }) {
  const { camera, gl } = useThree();
  const pos = useRef({ x: start[0], y: start[1], yaw: 0, pitch: -0.05 });
  const keys = useRef(new Set<string>());
  const look = useRef<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    pos.current = { x: start[0], y: start[1], yaw: 0, pitch: -0.05 };
    camera.rotation.order = "YXZ";
  }, [start, camera]);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const prevFov = cam.fov;
    cam.fov = 70;
    cam.updateProjectionMatrix();
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, select, textarea")) return;
      keys.current.add(e.key.toLowerCase());
      if (e.key.startsWith("Arrow")) e.preventDefault();
    };
    const upKey = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const el = gl.domElement;
    const pd = (e: PointerEvent) => {
      look.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    };
    const pm = (e: PointerEvent) => {
      const l = look.current;
      if (!l || l.id !== e.pointerId) return;
      pos.current.yaw -= (e.clientX - l.x) * 0.004;
      pos.current.pitch = Math.max(-1.2, Math.min(1.2, pos.current.pitch - (e.clientY - l.y) * 0.004));
      look.current = { ...l, x: e.clientX, y: e.clientY };
    };
    const pu = () => (look.current = null);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", upKey);
    el.addEventListener("pointerdown", pd);
    el.addEventListener("pointermove", pm);
    el.addEventListener("pointerup", pu);
    return () => {
      cam.fov = prevFov;
      cam.updateProjectionMatrix();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", upKey);
      el.removeEventListener("pointerdown", pd);
      el.removeEventListener("pointermove", pm);
      el.removeEventListener("pointerup", pu);
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    const k = keys.current, p = pos.current;
    const step = Math.min(dt, 0.05);
    const fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) + walkInput.forward;
    const side = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0) + walkInput.strafe;
    const turn = (k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("e") ? 1 : 0) + walkInput.turn;
    p.yaw += turn * 1.8 * step;
    const speed = (k.has("shift") ? 2.6 : 1.3) * step;
    // Blickrichtung yaw=0 → −z (im Plan „nach oben“)
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const dx = (fx * fwd + -fz * side) * speed, dz = (fz * fwd + fx * side) * speed;
    // achsweise bewegen → man gleitet an Wänden entlang statt stecken zu bleiben
    if (dx && !blocked(p.x + dx, p.y, blockers, furniture)) p.x += dx;
    if (dz && !blocked(p.x, p.y + dz, blockers, furniture)) p.y += dz;
    camera.position.set(p.x, EYE_HEIGHT, p.y);
    camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
  });
  return null;
}
