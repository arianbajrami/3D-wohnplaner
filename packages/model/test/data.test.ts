import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePlan, validatePlan, Variant } from "../src";

/**
 * Prüft alle Dateien, die die App ins Repo schreibt (auch die, die über „Synchronisieren“
 * direkt auf main landen): Grundrisse in plans/ und Varianten in designs/.
 */
const root = path.resolve(import.meta.dirname, "../../..");
const files = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return statSync(p).isDirectory() ? files(p) : f.endsWith(".json") ? [p] : [];
      })
    : [];
const rel = (p: string) => path.relative(root, p);

const plans = new Map(files(path.join(root, "plans")).map((f) => [path.basename(f, ".json"), f]));

describe("plans/", () => {
  it("enthält mindestens einen Grundriss", () => expect(plans.size).toBeGreaterThan(0));
  for (const [key, file] of plans)
    it(`${rel(file)} ist gültig`, () => {
      const plan = parsePlan(JSON.parse(readFileSync(file, "utf8")));
      expect(validatePlan(plan).filter((i) => i.level === "error")).toEqual([]);
      expect(key).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    });
});

describe("designs/", () => {
  const designs = files(path.join(root, "designs"));
  it(`${designs.length} Variante(n) gefunden`, () => expect(designs.every((f) => f.endsWith(".json"))).toBe(true));
  for (const file of designs)
    it(`${rel(file)} ist eine gültige Variante am richtigen Ort`, () => {
      const v = Variant.parse(JSON.parse(readFileSync(file, "utf8")));
      // designs/<plan>/<person>/<id>.json
      const [plan, author, name] = rel(file).split(path.sep).slice(1);
      expect({ plan: v.plan, author: v.author, id: `${v.id}.json` }).toEqual({ plan, author, id: name });
      expect(plans.has(v.plan), `Grundriss plans/${v.plan}.json fehlt`).toBe(true);
      // Verweise auf Räume und Wände müssen im Grundriss existieren
      const base = parsePlan(JSON.parse(readFileSync(plans.get(v.plan)!, "utf8")));
      const rooms = new Set(base.rooms.map((r) => r.id)), walls = new Set(base.walls.map((w) => w.id));
      expect(Object.keys(v.rooms).filter((id) => !rooms.has(id)), "unbekannte Räume").toEqual([]);
      expect(Object.keys(v.walls).filter((id) => !walls.has(id)), "unbekannte Wände").toEqual([]);
    });
});
