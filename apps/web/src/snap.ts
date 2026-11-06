import { roomAt, type Furniture, type Plan, type Point, type WallGeometry } from "@wohnplaner/model";

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

/**
 * Neue Position beim Ziehen: an Wänden einrasten, aber nie außerhalb aller Räume landen
 * (sonst bleibt das Möbel, wo es war).
 */
export function dragTarget(plan: Plan, geoms: WallGeometry[], f: Furniture, x: number, y: number, tol: number): Point {
  const p = snapToWalls(geoms, { ...f, x, y }, tol);
  if (!roomAt(plan, p)) return [f.x, f.y];
  return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
}
