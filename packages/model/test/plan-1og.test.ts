import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apartmentAreaChecks,
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
