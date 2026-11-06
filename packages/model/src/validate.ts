import { wallGeometry } from "./geometry";
import { Plan, SCHEMA_VERSION } from "./schema";

export interface Issue {
  level: "error" | "warning";
  message: string;
}

/**
 * Hebt ältere Modell-Versionen auf die aktuelle an.
 * Jede künftige Version bekommt hier eine reine Funktion vN → vN+1.
 */
export function migrate(raw: unknown): unknown {
  const v = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (v === SCHEMA_VERSION) return raw;
  throw new Error(`Unbekannte schemaVersion: ${String(v)} (unterstützt: ${SCHEMA_VERSION})`);
}

/** Liest ein Modell aus beliebigem JSON: migrieren, Schema prüfen. Wirft bei Schemafehlern. */
export function parsePlan(raw: unknown): Plan {
  return Plan.parse(migrate(raw));
}

/** Inhaltliche Prüfungen, die das Schema allein nicht abdeckt. */
export function validatePlan(plan: Plan): Issue[] {
  const issues: Issue[] = [];
  const err = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(`${kind}-ID doppelt: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const nodeIds = unique("Knoten", plan.nodes.map((n) => n.id));
  const wallIds = unique("Wand", plan.walls.map((w) => w.id));
  unique("Öffnung", plan.openings.map((o) => o.id));
  unique("Raum", plan.rooms.map((r) => r.id));
  const aptIds = unique("Wohnung", plan.apartments.map((a) => a.id));

  for (const w of plan.walls) {
    if (!nodeIds.has(w.a) || !nodeIds.has(w.b)) err(`Wand ${w.id}: unbekannter Knoten`);
    else if (w.a === w.b) err(`Wand ${w.id}: Anfang und Ende identisch`);
  }
  for (const r of plan.rooms) {
    if (r.apartment && !aptIds.has(r.apartment)) err(`Raum ${r.id}: unbekannte Wohnung ${r.apartment}`);
  }

  for (const w of plan.walls) {
    if (!nodeIds.has(w.a) || !nodeIds.has(w.b)) continue;
    const g = wallGeometry(plan, w);
    const ops = plan.openings.filter((o) => o.wall === w.id).sort((p, q) => p.offset - q.offset);
    let lastEnd = -Infinity;
    for (const o of ops) {
      const s = o.offset - o.width / 2, e = o.offset + o.width / 2;
      if (s < -1e-6 || e > g.length + 1e-6) err(`Öffnung ${o.id} ragt über Wand ${w.id} hinaus`);
      if (s < lastEnd - 1e-6) err(`Öffnung ${o.id} überlappt die vorherige Öffnung auf Wand ${w.id}`);
      if (o.sill + o.height > g.height + 1e-6) warn(`Öffnung ${o.id} ist höher als die Wand ${w.id}`);
      lastEnd = e;
    }
  }
  for (const o of plan.openings) if (!wallIds.has(o.wall)) err(`Öffnung ${o.id}: unbekannte Wand ${o.wall}`);
  return issues;
}
