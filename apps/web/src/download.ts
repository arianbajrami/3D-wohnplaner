import type { Plan } from "@wohnplaner/model";

export function downloadJson(plan: Plan, filename: string) {
  const blob = new Blob([JSON.stringify(plan, null, 1) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
