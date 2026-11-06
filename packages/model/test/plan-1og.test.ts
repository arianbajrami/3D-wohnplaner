import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apartmentAreaChecks,
  applyVariant,
  compareDesigns,
  extractDesign,
  sameDesign,
  slugify,
  stripDesign,
  applyHomography,
  homography,
  parsePlan,
  roomAreaChecks,
  validatePlan,
  visibility,
  wallGeometry,
  wallSideRooms,
  type Point,
} from "../src";

const raw = JSON.parse(readFileSync(new URL("../../../plans/1og.json", import.meta.url), "utf8"));
const plan = parsePlan(raw);

describe("Referenzfall 1. OG", () => {
  it("ist schemakonform und inhaltlich konsistent", () => {
    expect(validatePlan(plan).filter((i) => i.level === "error")).toEqual([]);
  });

  it("trifft jede beschriftete Raumfläche auf ±3 %", () => {
    for (const c of roomAreaChecks(plan)) {
      if (c.deviation === undefined) continue;
      expect(Math.abs(c.deviation), `${c.name} (${c.id}): ${c.area.toFixed(2)} statt ${c.target}`).toBeLessThan(0.03);
    }
  });

  it("trifft die Wohnungsflächen Ost 101,4 und West 68,2 auf ±1 %", () => {
    const checks = apartmentAreaChecks(plan);
    expect(checks.map((c) => c.id).sort()).toEqual(["ost", "west"]);
    for (const c of checks) expect(Math.abs(c.deviation!), c.name).toBeLessThan(0.01);
  });

  it("zählt das Treppenhaus nicht zur Wohnfläche", () => {
    const stairs = plan.rooms.find((r) => r.name === "Treppenhaus");
    expect(stairs?.countsAsLivingArea).toBe(false);
    expect(stairs?.apartment).toBeUndefined();
  });
});

describe("homography", () => {
  it("bildet die Kalibrierpunkte exakt ab", () => {
    const cal = plan.meta.source!.calibration!;
    const h = homography(cal.modelPoints, cal.imagePoints);
    cal.modelPoints.forEach((p, i) => {
      const [u, v] = applyHomography(h, p);
      expect(u).toBeCloseTo(cal.imagePoints[i]![0], 6);
      expect(v).toBeCloseTo(cal.imagePoints[i]![1], 6);
    });
  });

  it("ist für ein Rechteck auf ein Rechteck eine reine Skalierung", () => {
    const sq: Point[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const h = homography(sq, sq.map(([x, y]) => [x * 2, y * 3] as Point));
    const [u, v] = applyHomography(h, [0.5, 0.5]);
    expect(u).toBeCloseTo(1, 9);
    expect(v).toBeCloseTo(1.5, 9);
  });
});

describe("Sichtbarkeit und Wandseiten", () => {
  it("zeigt bei Fokus auf eine Wohnung nur deren Räume", () => {
    const v = visibility(plan, "apt:ost");
    expect([...v.rooms].sort()).toEqual(plan.rooms.filter((r) => r.apartment === "ost").map((r) => r.id).sort());
    expect(v.rooms.has("r-treppe")).toBe(false);
  });

  it("findet für einen Raum genau die angrenzenden Wände", () => {
    const v = visibility(plan, "room:r-ost-1");
    // Zimmer oben links: Außenwand Nord und West, Innenwand rechts, Wand zum Zimmer 9,6
    expect(v.walls.size).toBeGreaterThanOrEqual(4);
    expect(v.walls.has("iw-1")).toBe(true);
    expect([...v.walls].some((id) => id.startsWith("aw-nord"))).toBe(true);
    expect([...v.walls].some((id) => id.startsWith("aw-ost"))).toBe(false);
  });

  it("ordnet beiden Seiten einer Innenwand den richtigen Raum zu", () => {
    const w = plan.walls.find((x) => x.id === "iw-1")!;
    const sides = wallSideRooms(plan, wallGeometry(plan, w));
    expect(new Set([sides.left, sides.right])).toEqual(new Set(["r-ost-1", "r-ost-2"]));
  });
});

describe("Migration", () => {
  it("hebt ein v1-Modell auf v2 an", () => {
    const v1 = { ...raw, schemaVersion: 1, furniture: [{ id: "f1", type: "sofa-3", x: 1, y: 1, width: 2, depth: 1, height: 0.8, color: "#ff0000" }] };
    const p = parsePlan(v1);
    expect(p.schemaVersion).toBe(2);
    expect(p.furniture[0]!.finishes).toEqual({ main: "#ff0000" });
  });
});

describe("Varianten", () => {
  const designed = {
    ...plan,
    rooms: plan.rooms.map((r) => (r.id === "r-ost-3" ? { ...r, finishes: { floor: "eiche-natur", walls: "#e9e0d2", style: "landhaus" } } : r)),
    walls: plan.walls.map((w) => (w.id === "iw-1" ? { ...w, finishes: { left: "#8a9977" } } : w)),
    furniture: [{ id: "k1", type: "kuechen-unterschrank", x: 9, y: 0.78, rotation: 0, elevation: 0, width: 2.4, depth: 0.6, height: 0.9, finishes: { front: "#ffffff" } }],
  };

  it("trennt Gestaltung und Grundriss verlustfrei", () => {
    const design = extractDesign(designed);
    expect(Object.keys(design.rooms)).toEqual(["r-ost-3"]);
    expect(Object.keys(design.walls)).toEqual(["iw-1"]);
    const roundtrip = applyVariant(stripDesign(designed), design);
    expect(sameDesign(extractDesign(roundtrip), design)).toBe(true);
    expect(stripDesign(roundtrip)).toEqual(stripDesign(designed));
    // eine gespeicherte Variante (mit Metadaten) gilt als gleich, wenn die Gestaltung gleich ist
    expect(sameDesign(extractDesign(designed), { ...design, schemaVersion: 1, id: "x", name: "X" } as typeof design)).toBe(true);
  });

  it("vergleicht zwei Varianten Raum für Raum", () => {
    const diff = compareDesigns(plan, plan, designed);
    const kitchen = diff.find((d) => d.roomId === "r-ost-3")!;
    expect(kitchen.differs).toBe(true);
    expect(kitchen.floor).toEqual([undefined, "eiche-natur"]);
    expect(kitchen.furniture[1]).toEqual(["kuechen-unterschrank"]);
    expect(diff.find((d) => d.roomId === "r-ost-1")!.accentWalls).toEqual([0, 1]);
    expect(diff.find((d) => d.roomId === "r-west-5")!.differs).toBe(false);
  });

  it("macht aus Namen Dateinamen", () => {
    expect(slugify("Küche Landhaus")).toBe("kueche-landhaus");
    expect(slugify("  Wohnzimmer – Größer!  ")).toBe("wohnzimmer-groesser");
  });
});
