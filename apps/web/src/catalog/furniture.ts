import type { Use } from "./materials";

/**
 * Möbelkatalog. Jedes Möbel ist aus einfachen Quadern/Zylindern aufgebaut (parametrisch über
 * Breite/Tiefe/Höhe). Lokale Koordinaten: x = Breite, y = Tiefe (Rückseite −, Vorderseite +),
 * z = Höhe ab Unterkante. Ursprung = Mitte der Grundfläche.
 */

export type Role =
  | "fabric" | "legs" | "wood" | "front" | "worktop" | "plinth" | "ceramic" | "metal"
  | "glass" | "appliance" | "mattress" | "frame" | "pillow" | "cooktop" | "plant" | "lacquer" | "keys";

export interface RoleInfo {
  label: string;
  default: string;
  /** welche Material-/Farbauswahl angeboten wird */
  use: Use;
  /** RAL-Farben zusätzlich anbieten */
  paint: boolean;
}

export const ROLES: Record<Role, RoleInfo> = {
  fabric: { label: "Bezug", default: "stoff-hellgrau", use: "fabric", paint: true },
  legs: { label: "Füße/Gestell", default: "#3a3a3a", use: "wood", paint: true },
  wood: { label: "Holz", default: "eiche-natur", use: "wood", paint: true },
  front: { label: "Fronten", default: "#f1ece1", use: "front", paint: true },
  worktop: { label: "Arbeitsplatte", default: "eiche-natur", use: "worktop", paint: false },
  plinth: { label: "Sockel", default: "#3b3b3b", use: "front", paint: true },
  ceramic: { label: "Keramik", default: "#f6f6f3", use: "ceramic", paint: true },
  metal: { label: "Metall", default: "#a8aaad", use: "metal", paint: true },
  glass: { label: "Glas", default: "#d6e9ef", use: "metal", paint: false },
  appliance: { label: "Gerät", default: "#e8e8e6", use: "metal", paint: true },
  mattress: { label: "Matratze", default: "#f2f0ea", use: "fabric", paint: true },
  frame: { label: "Bettgestell", default: "stoff-hellgrau", use: "fabric", paint: true },
  pillow: { label: "Kissen", default: "#fbfaf6", use: "fabric", paint: true },
  cooktop: { label: "Kochfeld", default: "#151515", use: "metal", paint: false },
  plant: { label: "Pflanze", default: "#4f7a3e", use: "fabric", paint: true },
  // eigene Rollen fürs Klavier, damit Stilvorlagen (die „Holz“ umfärben) es schwarz lassen
  lacquer: { label: "Gehäuse", default: "#141414", use: "wood", paint: true },
  keys: { label: "Tasten", default: "#f7f5ef", use: "metal", paint: false },
};

export interface Part {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
  role: Role;
  shape?: "box" | "cylinder";
}

export interface FurnitureType {
  id: string;
  name: string;
  category: string;
  w: number;
  d: number;
  h: number;
  elevation?: number;
  roles: Role[];
  parts: (s: { w: number; d: number; h: number }) => Part[];
}

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, role: Role, shape?: Part["shape"]): Part =>
  ({ x0, x1, y0, y1, z0, z1, role, shape });

/** Vier Beine an den Ecken */
function legs(w: number, d: number, h: number, t: number, inset: number, role: Role = "legs"): Part[] {
  const xs = [-w / 2 + inset, w / 2 - inset - t], ys = [-d / 2 + inset, d / 2 - inset - t];
  return xs.flatMap((x) => ys.map((y) => box(x, x + t, y, y + t, 0, h, role)));
}

function sofa({ w, d, h }: { w: number; d: number; h: number }): Part[] {
  const arm = Math.min(0.2, w * 0.12), back = Math.min(0.22, d * 0.25), foot = 0.08;
  return [
    ...legs(w, d, foot, 0.05, 0.06),
    box(-w / 2, w / 2, -d / 2, d / 2, foot, 0.42, "fabric"),
    box(-w / 2 + arm, w / 2 - arm, -d / 2 + back, d / 2 - 0.02, 0.42, 0.5, "fabric"),
    box(-w / 2, w / 2, -d / 2, -d / 2 + back, 0.42, h, "fabric"),
    box(-w / 2, -w / 2 + arm, -d / 2, d / 2, 0.42, 0.62, "fabric"),
    box(w / 2 - arm, w / 2, -d / 2, d / 2, 0.42, 0.62, "fabric"),
  ];
}

function table({ w, d, h }: { w: number; d: number; h: number }, top: Role = "wood", leg: Role = "wood"): Part[] {
  return [box(-w / 2, w / 2, -d / 2, d / 2, h - 0.04, h, top), ...legs(w, d, h - 0.04, 0.06, 0.05, leg)];
}

/** Küchen-Unterschrank mit Sockel, Korpus und Arbeitsplatte */
function counter({ w, d, h }: { w: number; d: number; h: number }): Part[] {
  const top = 0.04, plinth = 0.1;
  return [
    box(-w / 2, w / 2, -d / 2, d / 2 - 0.06, 0, plinth, "plinth"),
    box(-w / 2, w / 2, -d / 2, d / 2 - 0.02, plinth, h - top, "front"),
    box(-w / 2, w / 2, -d / 2, d / 2, h - top, h, "worktop"),
  ];
}

function bed({ w, d, h }: { w: number; d: number; h: number }): Part[] {
  const frameH = 0.32, head = 0.08;
  const pw = w > 1.4 ? (w - 0.3) / 2 : w - 0.2;
  const pillows = w > 1.4
    ? [box(-w / 2 + 0.1, -w / 2 + 0.1 + pw, -d / 2 + head + 0.05, -d / 2 + head + 0.5, 0.52, 0.64, "pillow"),
       box(w / 2 - 0.1 - pw, w / 2 - 0.1, -d / 2 + head + 0.05, -d / 2 + head + 0.5, 0.52, 0.64, "pillow")]
    : [box(-pw / 2, pw / 2, -d / 2 + head + 0.05, -d / 2 + head + 0.5, 0.52, 0.64, "pillow")];
  return [
    box(-w / 2, w / 2, -d / 2, d / 2, 0, frameH, "frame"),
    box(-w / 2, w / 2, -d / 2, -d / 2 + head, 0, h, "frame"),
    box(-w / 2 + 0.05, w / 2 - 0.05, -d / 2 + head, d / 2 - 0.05, frameH, 0.52, "mattress"),
    ...pillows,
  ];
}

export const FURNITURE: FurnitureType[] = [
  // Wohnen
  { id: "sofa-3", name: "Sofa 3-Sitzer", category: "Wohnen", w: 2.2, d: 0.95, h: 0.85, roles: ["fabric", "legs"], parts: sofa },
  { id: "sofa-2", name: "Sofa 2-Sitzer", category: "Wohnen", w: 1.7, d: 0.92, h: 0.85, roles: ["fabric", "legs"], parts: sofa },
  { id: "sessel", name: "Sessel", category: "Wohnen", w: 0.85, d: 0.85, h: 0.85, roles: ["fabric", "legs"], parts: sofa },
  { id: "couchtisch", name: "Couchtisch", category: "Wohnen", w: 1.1, d: 0.6, h: 0.42, roles: ["wood", "legs"], parts: (s) => table(s, "wood", "legs") },
  {
    id: "tv-board", name: "TV-Board", category: "Wohnen", w: 1.8, d: 0.42, h: 0.5, roles: ["front", "legs"],
    parts: ({ w, d, h }) => [...legs(w, d, 0.1, 0.04, 0.05), box(-w / 2, w / 2, -d / 2, d / 2, 0.1, h, "front")],
  },
  {
    id: "regal", name: "Regal", category: "Wohnen", w: 0.9, d: 0.35, h: 2.0, roles: ["wood"],
    parts: ({ w, d, h }) => {
      const t = 0.025, n = Math.max(2, Math.round(h / 0.38));
      return [
        box(-w / 2, -w / 2 + t, -d / 2, d / 2, 0, h, "wood"),
        box(w / 2 - t, w / 2, -d / 2, d / 2, 0, h, "wood"),
        ...Array.from({ length: n + 1 }, (_, i) => {
          const z = (i * (h - t)) / n;
          return box(-w / 2 + t, w / 2 - t, -d / 2, d / 2, z, z + t, "wood");
        }),
      ];
    },
  },
  { id: "teppich", name: "Teppich", category: "Wohnen", w: 2.0, d: 1.4, h: 0.01, roles: ["fabric"], parts: ({ w, d, h }) => [box(-w / 2, w / 2, -d / 2, d / 2, 0, h, "fabric")] },
  {
    id: "pflanze", name: "Zimmerpflanze", category: "Wohnen", w: 0.45, d: 0.45, h: 1.3, roles: ["ceramic", "plant"],
    parts: ({ w, d, h }) => [
      box(-w * 0.35, w * 0.35, -d * 0.35, d * 0.35, 0, 0.35, "ceramic", "cylinder"),
      box(-w / 2, w / 2, -d / 2, d / 2, 0.35, h, "plant", "cylinder"),
    ],
  },
  // Musik
  {
    id: "klavier", name: "Klavier", category: "Musik", w: 1.5, d: 0.6, h: 1.25, roles: ["lacquer", "keys"],
    parts: ({ w, d, h }) => {
      const back = -d / 2 + 0.36; // Korpus hinten, Tastatur ragt nach vorne
      return [
        box(-w / 2, w / 2, -d / 2, back, 0, h, "lacquer"),
        box(-w / 2, w / 2, back, back + 0.04, 0.1, 0.68, "lacquer"),
        box(-w / 2, w / 2, back, d / 2 - 0.02, 0.68, 0.74, "lacquer"),
        box(-w / 2 + 0.06, w / 2 - 0.06, back + 0.02, d / 2 - 0.05, 0.74, 0.765, "keys"),
        box(-w / 2, -w / 2 + 0.06, back, d / 2, 0.66, 0.84, "lacquer"),
        box(w / 2 - 0.06, w / 2, back, d / 2, 0.66, 0.84, "lacquer"),
        box(-w / 2 + 0.02, -w / 2 + 0.08, d / 2 - 0.1, d / 2, 0, 0.68, "lacquer"),
        box(w / 2 - 0.08, w / 2 - 0.02, d / 2 - 0.1, d / 2, 0, 0.68, "lacquer"),
      ];
    },
  },
  {
    id: "fluegel", name: "Flügel", category: "Musik", w: 1.5, d: 1.75, h: 1.0, roles: ["lacquer", "keys"],
    parts: ({ w, d, h }) => {
      const kb = 0.22; // Tastaturbereich vorne
      return [
        // Korpus: vorne breit, hinten zum Schweif hin schmaler (vereinfacht in drei Stufen)
        box(-w / 2, w / 2, -d * 0.15, d / 2 - kb, 0.62, h, "lacquer"),
        box(-w / 2, w / 2 - w * 0.3, -d * 0.4, -d * 0.15, 0.62, h, "lacquer"),
        box(-w / 2, w / 2 - w * 0.55, -d / 2, -d * 0.4, 0.62, h, "lacquer"),
        box(-w / 2, w / 2, d / 2 - kb, d / 2, 0.62, 0.72, "lacquer"),
        box(-w / 2 + 0.07, w / 2 - 0.07, d / 2 - kb + 0.03, d / 2 - 0.02, 0.72, 0.745, "keys"),
        box(-w / 2 + 0.05, -w / 2 + 0.15, d / 2 - kb - 0.1, d / 2 - kb, 0, 0.62, "lacquer", "cylinder"),
        box(w / 2 - 0.15, w / 2 - 0.05, d / 2 - kb - 0.1, d / 2 - kb, 0, 0.62, "lacquer", "cylinder"),
        box(-w / 2 + 0.1, -w / 2 + 0.2, -d / 2 + 0.1, -d / 2 + 0.2, 0, 0.62, "lacquer", "cylinder"),
      ];
    },
  },
  {
    id: "klavierbank", name: "Klavierbank", category: "Musik", w: 0.6, d: 0.35, h: 0.5, roles: ["lacquer", "fabric"],
    parts: ({ w, d, h }) => [...legs(w, d, h - 0.07, 0.04, 0.02, "lacquer"), box(-w / 2, w / 2, -d / 2, d / 2, h - 0.07, h, "fabric")],
  },
  // Essen
  { id: "esstisch", name: "Esstisch", category: "Essen", w: 1.8, d: 0.9, h: 0.75, roles: ["wood"], parts: (s) => table(s) },
  {
    id: "stuhl", name: "Stuhl", category: "Essen", w: 0.45, d: 0.52, h: 0.88, roles: ["wood", "fabric"],
    parts: ({ w, d, h }) => [
      ...legs(w, d, 0.43, 0.035, 0.02, "wood"),
      box(-w / 2, w / 2, -d / 2, d / 2, 0.43, 0.48, "fabric"),
      box(-w / 2, w / 2, -d / 2, -d / 2 + 0.04, 0.48, h, "wood"),
    ],
  },
  // Küche
  { id: "kuechen-unterschrank", name: "Küchenzeile (Unterschrank)", category: "Küche", w: 2.4, d: 0.6, h: 0.9, roles: ["front", "worktop", "plinth"], parts: counter },
  {
    id: "kuechen-spuele", name: "Spülenschrank", category: "Küche", w: 0.8, d: 0.6, h: 0.9, roles: ["front", "worktop", "plinth", "metal"],
    parts: (s) => [
      ...counter(s),
      box(-s.w / 2 + 0.1, s.w / 2 - 0.1, -s.d / 2 + 0.12, s.d / 2 - 0.08, s.h, s.h + 0.004, "metal"),
      box(-0.02, 0.02, -s.d / 2 + 0.04, -s.d / 2 + 0.08, s.h, s.h + 0.3, "metal", "cylinder"),
    ],
  },
  {
    id: "kuechen-herd", name: "Herd mit Kochfeld", category: "Küche", w: 0.6, d: 0.6, h: 0.9, roles: ["front", "worktop", "plinth", "cooktop"],
    parts: (s) => [...counter(s), box(-s.w / 2 + 0.03, s.w / 2 - 0.03, -s.d / 2 + 0.06, s.d / 2 - 0.06, s.h, s.h + 0.006, "cooktop")],
  },
  {
    id: "kuechen-oberschrank", name: "Oberschrank", category: "Küche", w: 1.2, d: 0.35, h: 0.72, elevation: 1.45, roles: ["front"],
    parts: ({ w, d, h }) => [box(-w / 2, w / 2, -d / 2, d / 2, 0, h, "front")],
  },
  {
    id: "kuechen-hochschrank", name: "Hochschrank", category: "Küche", w: 0.6, d: 0.6, h: 2.17, roles: ["front", "plinth"],
    parts: ({ w, d, h }) => [box(-w / 2, w / 2, -d / 2, d / 2 - 0.06, 0, 0.1, "plinth"), box(-w / 2, w / 2, -d / 2, d / 2, 0.1, h, "front")],
  },
  {
    id: "kuehlschrank", name: "Kühlschrank (freistehend)", category: "Küche", w: 0.6, d: 0.66, h: 1.86, roles: ["appliance", "metal"],
    parts: ({ w, d, h }) => [
      box(-w / 2, w / 2, -d / 2, d / 2, 0, h, "appliance"),
      box(w / 2 - 0.08, w / 2 - 0.06, d / 2, d / 2 + 0.03, h * 0.45, h * 0.75, "metal"),
    ],
  },
  { id: "kochinsel", name: "Kochinsel", category: "Küche", w: 1.8, d: 0.9, h: 0.9, roles: ["front", "worktop", "plinth"], parts: counter },
  // Schlafen
  { id: "bett-doppel", name: "Doppelbett 180×200", category: "Schlafen", w: 1.9, d: 2.1, h: 1.0, roles: ["frame", "mattress", "pillow"], parts: bed },
  { id: "bett-einzel", name: "Einzelbett 90×200", category: "Schlafen", w: 1.0, d: 2.1, h: 0.9, roles: ["frame", "mattress", "pillow"], parts: bed },
  {
    id: "nachttisch", name: "Nachttisch", category: "Schlafen", w: 0.45, d: 0.4, h: 0.5, roles: ["front", "legs"],
    parts: ({ w, d, h }) => [...legs(w, d, 0.15, 0.03, 0.02), box(-w / 2, w / 2, -d / 2, d / 2, 0.15, h, "front")],
  },
  { id: "kleiderschrank", name: "Kleiderschrank", category: "Schlafen", w: 2.0, d: 0.6, h: 2.2, roles: ["front"], parts: ({ w, d, h }) => [box(-w / 2, w / 2, -d / 2, d / 2, 0, h, "front")] },
  {
    id: "kommode", name: "Kommode", category: "Schlafen", w: 1.2, d: 0.45, h: 0.85, roles: ["front", "legs"],
    parts: ({ w, d, h }) => [...legs(w, d, 0.12, 0.04, 0.03), box(-w / 2, w / 2, -d / 2, d / 2, 0.12, h, "front")],
  },
  // Bad
  {
    id: "badewanne", name: "Badewanne", category: "Bad", w: 1.7, d: 0.75, h: 0.58, roles: ["ceramic"],
    parts: ({ w, d, h }) => [
      box(-w / 2, w / 2, -d / 2, d / 2, 0, h, "ceramic"),
      box(-w / 2 + 0.08, w / 2 - 0.08, -d / 2 + 0.08, d / 2 - 0.08, h, h + 0.002, "glass"),
    ],
  },
  {
    id: "dusche", name: "Dusche 90×90", category: "Bad", w: 0.9, d: 0.9, h: 2.0, roles: ["ceramic", "glass"],
    parts: ({ w, d, h }) => [
      box(-w / 2, w / 2, -d / 2, d / 2, 0, 0.05, "ceramic"),
      box(-w / 2, w / 2, d / 2 - 0.01, d / 2, 0.05, h, "glass"),
      box(w / 2 - 0.01, w / 2, -d / 2, d / 2, 0.05, h, "glass"),
    ],
  },
  {
    id: "wc", name: "WC", category: "Bad", w: 0.38, d: 0.6, h: 0.8, roles: ["ceramic"],
    parts: ({ w, d, h }) => [
      box(-w / 2, w / 2, -d / 2, -d / 2 + 0.16, 0.3, h, "ceramic"),
      box(-w / 2 + 0.02, w / 2 - 0.02, -d / 2 + 0.1, d / 2, 0, 0.4, "ceramic", "cylinder"),
    ],
  },
  {
    id: "waschtisch", name: "Waschtisch mit Unterschrank", category: "Bad", w: 0.8, d: 0.48, h: 0.86, roles: ["front", "ceramic"],
    parts: ({ w, d, h }) => [box(-w / 2, w / 2, -d / 2, d / 2 - 0.02, 0.3, h - 0.05, "front"), box(-w / 2, w / 2, -d / 2, d / 2, h - 0.05, h, "ceramic")],
  },
  { id: "waschmaschine", name: "Waschmaschine", category: "Bad", w: 0.6, d: 0.6, h: 0.85, roles: ["appliance"], parts: ({ w, d, h }) => [box(-w / 2, w / 2, -d / 2, d / 2, 0, h, "appliance")] },
  // Arbeiten
  { id: "schreibtisch", name: "Schreibtisch", category: "Arbeiten", w: 1.4, d: 0.7, h: 0.75, roles: ["wood", "legs"], parts: (s) => table(s, "wood", "legs") },
  {
    id: "buerostuhl", name: "Bürostuhl", category: "Arbeiten", w: 0.6, d: 0.6, h: 1.0, roles: ["fabric", "metal"],
    parts: ({ w, d, h }) => [
      box(-w / 2, w / 2, -d / 2, d / 2, 0, 0.04, "metal", "cylinder"),
      box(-0.03, 0.03, -0.03, 0.03, 0.04, 0.42, "metal", "cylinder"),
      box(-w * 0.4, w * 0.4, -d * 0.4, d * 0.4, 0.42, 0.5, "fabric"),
      box(-w * 0.38, w * 0.38, -d * 0.45, -d * 0.36, 0.5, h, "fabric"),
    ],
  },
];

export const FURNITURE_BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));
export const CATEGORIES = [...new Set(FURNITURE.map((f) => f.category))];

/** Fallback für unbekannte Typen: ein einfacher Quader */
export function furnitureParts(type: string, s: { w: number; d: number; h: number }): Part[] {
  const t = FURNITURE_BY_ID.get(type);
  return t ? t.parts(s) : [box(-s.w / 2, s.w / 2, -s.d / 2, s.d / 2, 0, s.h, "front")];
}
