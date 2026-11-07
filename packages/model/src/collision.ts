import { activeWalls, pointInPolygon, wallGeometry } from "./geometry";
import type { Furniture, Plan, Point, Room } from "./schema";

/**
 * Kollisionen und Abstände in der Draufsicht. Möbel und Wände sind gedrehte Rechtecke (OBB):
 * Mittelpunkt, Einheitsvektor u entlang der „Breite“ und halbe Ausdehnungen.
 */
export interface Box {
  c: Point;
  u: Point;
  /** halbe Ausdehnung entlang u */
  hu: number;
  /** halbe Ausdehnung senkrecht zu u */
  hv: number;
  /** Höhenbereich, damit z. B. ein Oberschrank über der Arbeitsplatte keine Kollision ist */
  z0: number;
  z1: number;
  /** woher das Hindernis stammt (für Anzeige/Ausschluss) */
  source: { kind: "wall" | "furniture"; id: string };
}

const EPS = 1e-4;
/** Flache Dinge (Teppich) blockieren nichts – man stellt Möbel darauf. */
const isFlat = (f: Furniture) => f.height <= 0.03;

export function furnitureBox(f: Furniture, at?: Point, rotation = f.rotation): Box {
  const r = (rotation * Math.PI) / 180;
  return {
    c: at ?? [f.x, f.y],
    u: [Math.cos(r), Math.sin(r)],
    hu: f.width / 2,
    hv: f.depth / 2,
    z0: f.elevation,
    z1: f.elevation + f.height,
    source: { kind: "furniture", id: f.id },
  };
}

export function boxCorners(b: Box): Point[] {
  const [ux, uy] = b.u, [vx, vy] = [-b.u[1], b.u[0]];
  return [
    [b.c[0] - ux * b.hu - vx * b.hv, b.c[1] - uy * b.hu - vy * b.hv],
    [b.c[0] + ux * b.hu - vx * b.hv, b.c[1] + uy * b.hu - vy * b.hv],
    [b.c[0] + ux * b.hu + vx * b.hv, b.c[1] + uy * b.hu + vy * b.hv],
    [b.c[0] - ux * b.hu + vx * b.hv, b.c[1] - uy * b.hu + vy * b.hv],
  ];
}

/** Hindernisse für ein Möbel: alle stehenden Wände und alle anderen Möbel, die in der Höhe überlappen. */
export function obstaclesFor(plan: Plan, f: Furniture): Box[] {
  const walls: Box[] = activeWalls(plan).map((w) => {
    const g = wallGeometry(plan, w);
    return {
      c: [(g.start[0] + g.end[0]) / 2, (g.start[1] + g.end[1]) / 2],
      u: g.dir,
      // Wandenden reichen bis in die Ecken hinein (wie in 3D)
      hu: g.length / 2 + w.thickness / 2,
      hv: w.thickness / 2,
      z0: 0,
      z1: g.height,
      source: { kind: "wall", id: w.id },
    };
  });
  if (isFlat(f)) return walls;
  const z0 = f.elevation, z1 = f.elevation + f.height;
  const others = plan.furniture
    .filter((o) => o.id !== f.id && !isFlat(o) && o.elevation < z1 - EPS && o.elevation + o.height > z0 + EPS)
    .map((o) => furnitureBox(o));
  return [...walls, ...others];
}

const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const radius = (b: Box, axis: Point) => b.hu * Math.abs(dot(b.u, axis)) + b.hv * Math.abs(dot([-b.u[1], b.u[0]], axis));

/**
 * Überlappung zweier Rechtecke (Trennachsen-Verfahren). Gibt den kleinsten Verschiebevektor
 * zurück, der `a` aus `b` herausschiebt – oder undefined, wenn sie sich höchstens berühren.
 */
export function overlap(a: Box, b: Box): Point | undefined {
  const d: Point = [a.c[0] - b.c[0], a.c[1] - b.c[1]];
  let best: { depth: number; axis: Point } | undefined;
  for (const axis of [a.u, [-a.u[1], a.u[0]] as Point, b.u, [-b.u[1], b.u[0]] as Point]) {
    const depth = radius(a, axis) + radius(b, axis) - Math.abs(dot(d, axis));
    if (depth <= EPS) return undefined;
    if (!best || depth < best.depth) best = { depth, axis: dot(d, axis) < 0 ? [-axis[0], -axis[1]] : axis };
  }
  return [best!.axis[0] * best!.depth, best!.axis[1] * best!.depth];
}

/**
 * Schiebt ein Möbel an die Stelle, an der es keine Wand und kein anderes Möbel überlappt –
 * also genau bis zur Berührung. Gibt undefined zurück, wenn das nicht gelingt.
 */
export function resolveCollisions(box: Box, obstacles: Box[]): Point | undefined {
  let c = box.c;
  for (let i = 0; i < 12; i++) {
    let worst: Point | undefined, worstLen = 0;
    for (const o of obstacles) {
      const m = overlap({ ...box, c }, o);
      if (m && Math.hypot(m[0], m[1]) > worstLen) {
        worst = m;
        worstLen = Math.hypot(m[0], m[1]);
      }
    }
    if (!worst) return c;
    c = [c[0] + worst[0], c[1] + worst[1]];
  }
  return obstacles.some((o) => overlap({ ...box, c }, o)) ? undefined : c;
}

/** Liegt das ganze Möbel innerhalb des Raums? (alle Ecken, 1 mm nach innen gerückt, in einer Teilfläche) */
export function boxInsideRoom(box: Box, room: Room): boolean {
  return boxCorners(box).every((p) => {
    const dx = box.c[0] - p[0], dy = box.c[1] - p[1], l = Math.hypot(dx, dy) || 1;
    const q: Point = [p[0] + (dx / l) * 1e-3, p[1] + (dy / l) * 1e-3];
    return room.polygons.some((poly) => pointInPolygon(q, poly));
  });
}

/**
 * Lichter Abstand in eine Richtung (Einheitsvektor) vom Rand des Möbels bis zum nächsten
 * Hindernis. Es wird von drei Punkten der Kante aus gemessen (Mitte und beide Ecken).
 */
export function clearance(box: Box, dir: Point, obstacles: Box[], max = 10): { distance: number; from: Point; to: Point } | undefined {
  // Ergebnis: Maßlinie von der Kantenmitte aus, Länge = kleinster Abstand der drei Messpunkte
  const v: Point = [-box.u[1], box.u[0]];
  // Kante, die in Richtung dir zeigt
  const alongU = Math.abs(dot(dir, box.u)) > 0.5;
  const sign = Math.sign(dot(dir, alongU ? box.u : v));
  const n = alongU ? box.u : v, t = alongU ? v : box.u;
  const half = alongU ? box.hu : box.hv, side = alongU ? box.hv : box.hu;
  const mid: Point = [box.c[0] + n[0] * half * sign, box.c[1] + n[1] * half * sign];
  let best: number | undefined;
  for (const s of [0, -0.98, 0.98]) {
    const from: Point = [mid[0] + t[0] * side * s, mid[1] + t[1] * side * s];
    for (const o of obstacles) {
      const d = rayBox(from, dir, o);
      if (d !== undefined && d >= -EPS && d < max && (best === undefined || d < best)) best = Math.max(0, d);
    }
  }
  if (best === undefined) return undefined;
  return { distance: best, from: mid, to: [mid[0] + dir[0] * best, mid[1] + dir[1] * best] };
}

/** Abstand entlang eines Strahls bis zum Eintritt in ein Rechteck (Slab-Verfahren) */
function rayBox(p: Point, dir: Point, b: Box): number | undefined {
  const v: Point = [-b.u[1], b.u[0]];
  const rel: Point = [p[0] - b.c[0], p[1] - b.c[1]];
  let tmin = -Infinity, tmax = Infinity;
  for (const [axis, h] of [[b.u, b.hu], [v, b.hv]] as [Point, number][]) {
    const o = dot(rel, axis), d = dot(dir, axis);
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(o) > h - EPS) return undefined;
    } else {
      let t1 = (-h - o) / d, t2 = (h - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return undefined;
    }
  }
  return tmax < 0 ? undefined : tmin;
}

/** Die vier Richtungen eines Möbels (rechts, links, vorne, hinten) in Planansicht */
export function furnitureDirections(f: Furniture): { key: "right" | "left" | "front" | "back"; dir: Point }[] {
  const r = (f.rotation * Math.PI) / 180;
  const u: Point = [Math.cos(r), Math.sin(r)], v: Point = [-Math.sin(r), Math.cos(r)];
  return [
    { key: "right", dir: u },
    { key: "left", dir: [-u[0], -u[1]] },
    { key: "front", dir: v },
    { key: "back", dir: [-v[0], -v[1]] },
  ];
}
