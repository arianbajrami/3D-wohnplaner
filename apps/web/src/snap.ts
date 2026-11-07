import {
  boxInsideRoom,
  furnitureBox,
  obstaclesFor,
  overlap,
  pointInPolygon,
  resolveCollisions,
  roomAt,
  roomLabelPoint,
  type Furniture,
  type Plan,
  type Point,
  type Room,
  type WallGeometry,
} from "@wohnplaner/model";

/**
 * Lässt ein Möbel an Wandflächen einrasten: Liegt eine Kante näher als `tol` an einer Wand,
 * wird sie bündig an die Wand geschoben. Mit zwei Wänden (Ecke) rastet es in beide Richtungen ein.
 */
export function snapToWalls(geoms: WallGeometry[], f: Furniture, tol: number): Point {
  let [x, y] = [f.x, f.y];
  const r = (f.rotation * Math.PI) / 180;
  const ux: Point = [Math.cos(r), Math.sin(r)], uy: Point = [-Math.sin(r), Math.cos(r)];
  const snapped: Point[] = [];
  const candidates = geoms
    .map((g) => {
      const rel: Point = [x - g.start[0], y - g.start[1]];
      const along = rel[0] * g.dir[0] + rel[1] * g.dir[1];
      const across = rel[0] * g.normal[0] + rel[1] * g.normal[1];
      // halbe Ausdehnung des gedrehten Möbels senkrecht zur Wand
      const ext = (Math.abs(g.normal[0] * ux[0] + g.normal[1] * ux[1]) * f.width) / 2 + (Math.abs(g.normal[0] * uy[0] + g.normal[1] * uy[1]) * f.depth) / 2;
      const target = Math.sign(across || 1) * (g.wall.thickness / 2 + ext);
      // steckt das Möbel in der Wand (Mitte noch auf der Raumseite), wird es immer herausgeschoben
      const overlapping = Math.abs(across) < Math.abs(target) && Math.abs(across) > g.wall.thickness / 2;
      return { g, along, across, target, gap: Math.abs(across - target), overlapping };
    })
    .filter((c) => (c.gap < tol || c.overlapping) && c.along > -0.1 && c.along < c.g.length + 0.1)
    .sort((a, b) => a.gap - b.gap);
  for (const c of candidates) {
    // nur eine Wand je Richtung (sonst würden parallele Wände gegeneinander arbeiten)
    if (snapped.some((n) => Math.abs(n[0] * c.g.normal[0] + n[1] * c.g.normal[1]) > 0.9)) continue;
    const shift = c.target - c.across;
    x += c.g.normal[0] * shift;
    y += c.g.normal[1] * shift;
    snapped.push(c.g.normal);
    if (snapped.length === 2) break;
  }
  return [x, y];
}

const round = (v: number) => Math.round(v * 10000) / 10000; // 0,1 mm

/**
 * Ist das Möbel an Position p gültig? Keine Überlappung mit Wänden/Möbeln und – wenn ein Raum
 * vorgegeben ist – vollständig in diesem Raum, sonst wenigstens mit der Mitte in irgendeinem Raum.
 * Gibt die (ggf. bis zur Berührung herausgeschobene) Position zurück.
 */
function valid(plan: Plan, f: Furniture, p: Point, room?: Room): Point | undefined {
  const c = resolveCollisions(furnitureBox(f, p), obstaclesFor(plan, f));
  if (!c) return undefined;
  if (room ? !boxInsideRoom(furnitureBox(f, c), room) : !roomAt(plan, c)) return undefined;
  return c;
}

/**
 * Neue Position beim Verschieben (Ziehen, Pfeiltasten): an Wänden einrasten, nie in Wände oder
 * andere Möbel hinein (stoppt genau beim Berühren) und – wenn ein Raum geöffnet ist – nie aus
 * diesem Raum heraus. Ist das Ziel ungültig, wird so weit wie möglich in Richtung Ziel bewegt.
 */
export function placeFurniture(plan: Plan, geoms: WallGeometry[], f: Furniture, x: number, y: number, tol: number, room?: Room): Point {
  const wanted = snapToWalls(geoms, { ...f, x, y }, tol);
  const direct = valid(plan, f, wanted, room);
  if (direct) return [round(direct[0]), round(direct[1])];
  // Halbierungssuche auf der Strecke alt → neu
  let lo = 0, hi = 1, best: Point = [f.x, f.y];
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2;
    const p = valid(plan, f, [f.x + (wanted[0] - f.x) * t, f.y + (wanted[1] - f.y) * t], room);
    if (p) {
      best = p;
      lo = t;
    } else hi = t;
  }
  return [round(best[0]), round(best[1])];
}

/**
 * Freier Platz für ein neues oder dupliziertes Möbel im Raum: zuerst direkt bündig rechts,
 * links, davor oder dahinter neben `near` (praktisch für Küchenzeilen), sonst die Raummitte,
 * sonst ein Raster über den Raum.
 */
export function findFreeSpot(plan: Plan, f: Furniture, room: Room, near?: Furniture): Point | undefined {
  const candidates: Point[] = [];
  if (near) {
    const r = (near.rotation * Math.PI) / 180;
    const u: Point = [Math.cos(r), Math.sin(r)], v: Point = [-Math.sin(r), Math.cos(r)];
    const gapU = (near.width + f.width) / 2, gapV = (near.depth + f.depth) / 2;
    for (const [d, g] of [[u, gapU], [[-u[0], -u[1]], gapU], [v, gapV], [[-v[0], -v[1]], gapV]] as [Point, number][])
      candidates.push([near.x + d[0] * g, near.y + d[1] * g]);
  }
  candidates.push(roomLabelPoint(room));
  const xs = room.polygons.flat().map((p) => p[0]), ys = room.polygons.flat().map((p) => p[1]);
  for (let y = Math.min(...ys) + 0.1; y < Math.max(...ys); y += 0.1)
    for (let x = Math.min(...xs) + 0.1; x < Math.max(...xs); x += 0.1)
      if (room.polygons.some((poly) => pointInPolygon([x, y], poly))) candidates.push([x, y]);
  for (const c of candidates) {
    const box = furnitureBox(f, c);
    // hier ohne Herausschieben: der Platz muss wirklich frei sein
    if (obstaclesFor(plan, f).every((o) => !overlap(box, o)) && boxInsideRoom(box, room)) return [round(c[0]), round(c[1])];
  }
  return undefined;
}
