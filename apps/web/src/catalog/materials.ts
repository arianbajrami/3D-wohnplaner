/**
 * Materialien und Farben. Im Modell steht nur der Verweis (Material-ID oder "#rrggbb"),
 * das Aussehen wird hier festgelegt.
 */

export type Pattern = "plain" | "planks" | "tiles" | "stone" | "fabric";

/** Wofür ein Material oder eine Farbe angeboten wird */
export type Use = "floor" | "walls" | "front" | "worktop" | "fabric" | "wood" | "metal" | "ceramic";

export interface Material {
  id: string;
  name: string;
  group: string;
  color: string;
  pattern: Pattern;
  /** Kantenlänge einer Fliese bzw. Breite einer Diele in Metern */
  module?: number;
  uses: Use[];
}

export const MATERIALS: Material[] = [
  // Holz
  { id: "eiche-hell", name: "Eiche hell", group: "Holz", color: "#d9bb8c", pattern: "planks", module: 0.19, uses: ["floor", "wood", "front", "worktop"] },
  { id: "eiche-natur", name: "Eiche natur", group: "Holz", color: "#bf9462", pattern: "planks", module: 0.19, uses: ["floor", "wood", "front", "worktop"] },
  { id: "eiche-geraeuchert", name: "Eiche geräuchert", group: "Holz", color: "#7b5839", pattern: "planks", module: 0.19, uses: ["floor", "wood", "front", "worktop"] },
  { id: "nussbaum", name: "Nussbaum dunkel", group: "Holz", color: "#5b3b27", pattern: "planks", module: 0.16, uses: ["floor", "wood", "front", "worktop"] },
  { id: "esche-weiss", name: "Esche weiß geölt", group: "Holz", color: "#e5dccb", pattern: "planks", module: 0.19, uses: ["floor", "wood", "front"] },
  { id: "vinyl-eiche-grau", name: "Vinyl Eiche grau", group: "Holz", color: "#a59b8f", pattern: "planks", module: 0.2, uses: ["floor"] },
  // Fliesen
  { id: "fliese-weiss-30", name: "Fliese weiß 30×30", group: "Fliesen", color: "#ecebe6", pattern: "tiles", module: 0.3, uses: ["floor"] },
  { id: "fliese-hellgrau-60", name: "Fliese hellgrau 60×60", group: "Fliesen", color: "#cbc8c1", pattern: "tiles", module: 0.6, uses: ["floor"] },
  { id: "fliese-betongrau-60", name: "Fliese Betonoptik 60×60", group: "Fliesen", color: "#98958e", pattern: "tiles", module: 0.6, uses: ["floor"] },
  { id: "fliese-anthrazit-60", name: "Fliese anthrazit 60×60", group: "Fliesen", color: "#4b4b4c", pattern: "tiles", module: 0.6, uses: ["floor"] },
  { id: "terrakotta-30", name: "Terrakotta 30×30", group: "Fliesen", color: "#b1633d", pattern: "tiles", module: 0.3, uses: ["floor"] },
  // Stein & Beton
  { id: "beton", name: "Beton", group: "Stein & Beton", color: "#a6a49d", pattern: "stone", uses: ["floor", "worktop"] },
  { id: "quarz-weiss", name: "Quarzstein weiß", group: "Stein & Beton", color: "#efeee9", pattern: "stone", uses: ["worktop"] },
  { id: "granit-schwarz", name: "Granit schwarz", group: "Stein & Beton", color: "#2c2c2d", pattern: "stone", uses: ["worktop"] },
  { id: "marmor-weiss", name: "Marmor weiß", group: "Stein & Beton", color: "#e9e7e2", pattern: "stone", uses: ["worktop", "floor"] },
  // Textil
  { id: "teppich-beige", name: "Teppichboden beige", group: "Textil", color: "#cdbfa6", pattern: "fabric", uses: ["floor"] },
  { id: "leinen-natur", name: "Leinen natur", group: "Textil", color: "#d7cbb5", pattern: "fabric", uses: ["fabric"] },
  { id: "stoff-hellgrau", name: "Stoff hellgrau", group: "Textil", color: "#bcbcb8", pattern: "fabric", uses: ["fabric"] },
  { id: "stoff-anthrazit", name: "Stoff anthrazit", group: "Textil", color: "#525355", pattern: "fabric", uses: ["fabric"] },
  { id: "boucle-weiss", name: "Bouclé weiß", group: "Textil", color: "#ece7dc", pattern: "fabric", uses: ["fabric"] },
  { id: "samt-gruen", name: "Samt flaschengrün", group: "Textil", color: "#3f5e4a", pattern: "fabric", uses: ["fabric"] },
  { id: "leder-cognac", name: "Leder cognac", group: "Textil", color: "#8a522f", pattern: "plain", uses: ["fabric"] },
];

/**
 * RAL-Classic-Auswahl. Die Hex-Werte sind Näherungen für den Bildschirm;
 * für die echte Farbwahl immer eine physische Farbkarte nehmen.
 */
export const RAL_COLORS: { code: string; name: string; hex: string }[] = [
  { code: "9010", name: "Reinweiß", hex: "#f1ece1" },
  { code: "9016", name: "Verkehrsweiß", hex: "#f1f0ea" },
  { code: "9001", name: "Cremeweiß", hex: "#e9e0d2" },
  { code: "9002", name: "Grauweiß", hex: "#d7d5cb" },
  { code: "1013", name: "Perlweiß", hex: "#e3d9c6" },
  { code: "1015", name: "Hellelfenbein", hex: "#e6d2b5" },
  { code: "1001", name: "Beige", hex: "#d0b084" },
  { code: "1034", name: "Pastellgelb", hex: "#eba557" },
  { code: "3012", name: "Beigerot", hex: "#c6846d" },
  { code: "3015", name: "Hellrosa", hex: "#d8a0a6" },
  { code: "4009", name: "Pastellviolett", hex: "#a38995" },
  { code: "5024", name: "Pastellblau", hex: "#6093ac" },
  { code: "5014", name: "Taubenblau", hex: "#637d96" },
  { code: "5011", name: "Stahlblau", hex: "#1a2b3c" },
  { code: "6034", name: "Pastelltürkis", hex: "#7aadac" },
  { code: "6019", name: "Weißgrün", hex: "#b9ceac" },
  { code: "6021", name: "Blassgrün", hex: "#8a9977" },
  { code: "6011", name: "Resedagrün", hex: "#68825b" },
  { code: "7044", name: "Seidengrau", hex: "#b5b0a1" },
  { code: "7035", name: "Lichtgrau", hex: "#c5c7c4" },
  { code: "7038", name: "Achatgrau", hex: "#b0b0a9" },
  { code: "7015", name: "Schiefergrau", hex: "#51565c" },
  { code: "7016", name: "Anthrazitgrau", hex: "#383e42" },
  { code: "8025", name: "Blassbraun", hex: "#765d4d" },
  { code: "9005", name: "Tiefschwarz", hex: "#0e0e10" },
];

export const DEFAULT_WALL = "#f1ece1";
export const EXTERIOR_WALL = "#d8d2c8";

export interface ResolvedFinish {
  color: string;
  name: string;
  material?: Material;
}

const byId = new Map(MATERIALS.map((m) => [m.id, m]));
const byHex = new Map(RAL_COLORS.map((c) => [c.hex.toLowerCase(), c]));

export function resolveFinish(finish: string | undefined, fallback = "#cccccc"): ResolvedFinish {
  const f = finish ?? fallback;
  if (f.startsWith("#")) {
    const ral = byHex.get(f.toLowerCase());
    return { color: f, name: ral ? `RAL ${ral.code} ${ral.name}` : f.toUpperCase() };
  }
  const m = byId.get(f);
  return m ? { color: m.color, name: m.name, material: m } : { color: fallback, name: `unbekannt (${f})` };
}

export function materialsFor(use: Use): Material[] {
  return MATERIALS.filter((m) => m.uses.includes(use));
}
