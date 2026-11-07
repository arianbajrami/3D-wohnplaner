import type { Opening, Plan, Point, Room, Wall } from "./schema";

/** Fläche eines einfachen Polygons (Gaußsche Trapezformel), immer positiv. */
export function polygonArea(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function roomArea(room: Room): number {
  return room.polygons.reduce((sum, p) => sum + polygonArea(p), 0);
}

export function polygonCentroid(poly: readonly Point[]): Point {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-12) return poly[0]!;
  return [cx / (3 * a), cy / (3 * a)];
}

/** Größte Teilfläche – dort wird das Raumlabel platziert. */
export function roomLabelPoint(room: Room): Point {
  const largest = [...room.polygons].sort((p, q) => polygonArea(q) - polygonArea(p))[0]!;
  return polygonCentroid(largest);
}

export interface WallGeometry {
  wall: Wall;
  start: Point;
  end: Point;
  length: number;
  /** Einheitsvektor von a nach b */
  dir: Point;
  /** Einheitsnormale (links von dir) */
  normal: Point;
  height: number;
}

export function wallGeometry(plan: Plan, wall: Wall): WallGeometry {
  const a = plan.nodes.find((n) => n.id === wall.a);
  const b = plan.nodes.find((n) => n.id === wall.b);
  if (!a || !b) throw new Error(`Wand ${wall.id}: Knoten fehlt`);
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const dir: Point = length > 0 ? [dx / length, dy / length] : [1, 0];
  return {
    wall,
    start: [a.x, a.y],
    end: [b.x, b.y],
    length,
    dir,
    normal: [-dir[1], dir[0]],
    height: wall.height ?? plan.meta.defaultWallHeight,
  };
}

/** Umriss der Wand als Rechteck (4 Punkte) in der Ebene. */
export function wallOutline(g: WallGeometry): Point[] {
  const h = g.wall.thickness / 2;
  const [nx, ny] = [g.normal[0] * h, g.normal[1] * h];
  const [sx, sy] = g.start, [ex, ey] = g.end;
  return [
    [sx + nx, sy + ny],
    [ex + nx, ey + ny],
    [ex - nx, ey - ny],
    [sx - nx, sy - ny],
  ];
}

/** Öffnungen einer Wand, sortiert nach Position. */
export function wallOpenings(plan: Plan, wallId: string): Opening[] {
  return plan.openings.filter((o) => o.wall === wallId).sort((p, q) => p.offset - q.offset);
}

export interface AreaCheck {
  id: string;
  name: string;
  area: number;
  target?: number;
  /** relative Abweichung (area - target) / target */
  deviation?: number;
}

export function roomAreaChecks(plan: Plan): AreaCheck[] {
  return plan.rooms.map((r) => {
    const area = roomArea(r);
    const t = r.targetArea;
    return { id: r.id, name: r.name, area, target: t, deviation: t ? (area - t) / t : undefined };
  });
}

export function apartmentAreaChecks(plan: Plan): AreaCheck[] {
  return plan.apartments.map((ap) => {
    const area = plan.rooms
      .filter((r) => r.apartment === ap.id && r.countsAsLivingArea)
      .reduce((s, r) => s + roomArea(r), 0);
    const t = ap.targetArea;
    return { id: ap.id, name: ap.name, area, target: t, deviation: t ? (area - t) / t : undefined };
  });
}

/** Wände, die in der aktuellen Gestaltung stehen (entfernte Wände nicht mitgezählt). */
export function activeWalls(plan: Plan) {
  return plan.walls.filter((w) => !w.removed);
}

/** Punkt-in-Polygon (Strahlverfahren). */
export function pointInPolygon([x, y]: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function roomAt(plan: Plan, p: Point): Room | undefined {
  return plan.rooms.find((r) => r.polygons.some((poly) => pointInPolygon(p, poly)));
}

export type WallSide = "left" | "right";

/**
 * Welcher Raum liegt auf welcher Seite einer Wand? Es werden Punkte knapp vor beiden Wandflächen
 * abgetastet; der Raum mit den meisten Treffern gewinnt. Außenseiten haben keinen Raum.
 */
export function wallSideRooms(plan: Plan, g: WallGeometry): Record<WallSide, string | undefined> {
  const result: Record<WallSide, string | undefined> = { left: undefined, right: undefined };
  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    const votes = new Map<string, number>();
    const across = sign * (g.wall.thickness / 2 + 0.06);
    for (const t of [0.15, 0.3, 0.5, 0.7, 0.85]) {
      const along = g.length * t;
      const p: Point = [
        g.start[0] + g.dir[0] * along + g.normal[0] * across,
        g.start[1] + g.dir[1] * along + g.normal[1] * across,
      ];
      const r = roomAt(plan, p);
      if (r) votes.set(r.id, (votes.get(r.id) ?? 0) + 1);
    }
    result[side] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  return result;
}

/**
 * Sichtbarkeit für eine Fokus-Auswahl: "all", "apt:<id>" oder "room:<id>".
 * Liefert die sichtbaren Räume und Wände (Wände, die an mindestens einen sichtbaren Raum grenzen).
 */
export function visibility(plan: Plan, focus: string): { rooms: Set<string>; walls: Set<string> } {
  const all = { rooms: new Set(plan.rooms.map((r) => r.id)), walls: new Set(activeWalls(plan).map((w) => w.id)) };
  let rooms: Room[];
  if (focus.startsWith("apt:")) rooms = plan.rooms.filter((r) => r.apartment === focus.slice(4));
  else if (focus.startsWith("room:")) rooms = plan.rooms.filter((r) => r.id === focus.slice(5));
  else return all;
  const roomIds = new Set(rooms.map((r) => r.id));
  const walls = new Set<string>();
  for (const w of activeWalls(plan)) {
    const sides = wallSideRooms(plan, wallGeometry(plan, w));
    if ((sides.left && roomIds.has(sides.left)) || (sides.right && roomIds.has(sides.right))) walls.add(w.id);
  }
  return { rooms: roomIds, walls };
}

/** Begrenzungsrahmen [minX, minY, maxX, maxY] einer Punktmenge. */
export function bounds(points: readonly Point[]): [number, number, number, number] {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
