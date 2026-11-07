import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyVariant,
  boxInsideRoom,
  clearance,
  extractDesign,
  furnitureBox,
  obstaclesFor,
  overlap,
  parsePlan,
  resolveCollisions,
  stripDesign,
  visibility,
  type Furniture,
} from "../src";

const plan = parsePlan(JSON.parse(readFileSync(new URL("../../../plans/1og.json", import.meta.url), "utf8")));
const cabinet = (id: string, x: number, y: number, extra: Partial<Furniture> = {}): Furniture => ({
  id, type: "kuechen-unterschrank", x, y, rotation: 0, elevation: 0, width: 0.6, depth: 0.6, height: 0.9, finishes: {}, ...extra,
});

describe("Kollisionen", () => {
  it("erkennt Überlappung und schiebt genau bis zur Berührung", () => {
    const a = cabinet("a", 9.0, 2.0), b = cabinet("b", 9.4, 2.0);
    expect(overlap(furnitureBox(b), furnitureBox(a))).toBeDefined();
    const p = { ...plan, furniture: [a, b] };
    const c = resolveCollisions(furnitureBox(b), obstaclesFor(p, b))!;
    expect(c[0]).toBeCloseTo(9.6, 6); // bündig rechts neben a
    expect(c[1]).toBeCloseTo(2.0, 6);
  });

  it("lässt Berühren zu und blockiert Wände", () => {
    const a = cabinet("a", 9.0, 2.0), b = cabinet("b", 9.6, 2.0);
    expect(overlap(furnitureBox(b), furnitureBox(a))).toBeUndefined();
    // Zimmer 19,7: Innenfläche der Nordwand bei y = 0,48
    const intoWall = cabinet("w", 9.0, 0.6);
    const c = resolveCollisions(furnitureBox(intoWall), obstaclesFor({ ...plan, furniture: [intoWall] }, intoWall))!;
    expect(c[1]).toBeCloseTo(0.78, 6);
  });

  it("ignoriert Möbel in anderer Höhe und Teppiche", () => {
    const counter = cabinet("u", 9.0, 0.78);
    const upper = cabinet("o", 9.0, 0.66, { type: "kuechen-oberschrank", depth: 0.35, height: 0.72, elevation: 1.45 });
    const rug = cabinet("t", 9.0, 2.0, { type: "teppich", width: 2, depth: 1.4, height: 0.01 });
    const p = { ...plan, furniture: [counter, upper, rug] };
    expect(obstaclesFor(p, upper).some((o) => o.source.id === "u")).toBe(false);
    expect(obstaclesFor(p, counter).some((o) => o.source.id === "t")).toBe(false);
  });

  it("misst den Abstand zur nächsten Wand", () => {
    const a = cabinet("a", 9.0, 2.0);
    const up = clearance(furnitureBox(a), [0, -1], obstaclesFor({ ...plan, furniture: [a] }, a))!;
    expect(up.distance).toBeCloseTo(2.0 - 0.3 - 0.48, 6);
  });

  it("prüft, ob ein Möbel vollständig im Raum liegt", () => {
    const room = plan.rooms.find((r) => r.id === "r-ost-3")!;
    expect(boxInsideRoom(furnitureBox(cabinet("a", 9.0, 2.0)), room)).toBe(true);
    expect(boxInsideRoom(furnitureBox(cabinet("a", 7.9, 2.0)), room)).toBe(false);
  });
});

describe("Wände entfernen (je Variante)", () => {
  const open = { ...plan, walls: plan.walls.map((w) => (w.id === "iw-2" ? { ...w, removed: true } : w)) };

  it("gehört zur Gestaltung, nicht zum Grundriss", () => {
    const design = extractDesign(open);
    expect(design.walls["iw-2"]).toEqual({ finishes: undefined, removed: true });
    expect(stripDesign(open).walls.find((w) => w.id === "iw-2")!.removed).toBeUndefined();
    expect(applyVariant(stripDesign(open), design).walls.find((w) => w.id === "iw-2")!.removed).toBe(true);
  });

  it("entfernte Wände sind unsichtbar und kein Hindernis", () => {
    expect(visibility(open, "all").walls.has("iw-2")).toBe(false);
    const f = cabinet("a", 7.69, 2.0);
    expect(obstaclesFor(open, f).some((o) => o.source.id === "iw-2")).toBe(false);
  });
});
