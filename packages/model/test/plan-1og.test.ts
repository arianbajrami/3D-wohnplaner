import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apartmentAreaChecks,
  applyHomography,
  homography,
  parsePlan,
  roomAreaChecks,
  validatePlan,
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
