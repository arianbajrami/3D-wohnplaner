export function fmtArea(m2: number, digits = 1): string {
  return `${m2.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} m²`;
}

export function fmtPercent(v: number): string {
  const s = (v * 100).toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return `${v > 0 ? "+" : ""}${s} %`;
}

const known: Record<string, string> = { ost: "#8cc084", west: "#86a6d9" };
const extra = ["#d99a86", "#b88fd1", "#7cc4c0", "#d1b97c"];

/** Farbe je Wohnung; Räume ohne Wohnung (Treppenhaus) gelb. */
export function apartmentColor(id?: string): string {
  if (!id) return "#e3c46b";
  if (known[id]) return known[id];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return extra[h % extra.length]!;
}
