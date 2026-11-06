import { parsePlan, type Plan } from "@wohnplaner/model";

// Alle Grundriss-Modelle aus /plans und alle Fotos aus /samples werden beim Bauen eingesammelt.
const planFiles = import.meta.glob("../../../plans/*.json", { eager: true, import: "default" });
const photoFiles = import.meta.glob("../../../samples/*.{jpg,jpeg,png,JPG,JPEG,PNG}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export interface PlanEntry {
  key: string;
  plan: Plan;
}

export const bundledPlans: PlanEntry[] = Object.entries(planFiles)
  .map(([path, raw]) => ({ key: path.split("/").pop()!.replace(/\.json$/, ""), plan: parsePlan(raw) }))
  .sort((a, b) => a.key.localeCompare(b.key));

/** URL des Quellfotos, falls es im Repo unter samples/ liegt. */
export function photoUrlFor(plan: Plan): string | undefined {
  const file = plan.meta.source?.file;
  if (!file) return undefined;
  return photoFiles[`../../../${file}`];
}
