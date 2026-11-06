import type { Furniture, Plan, Room } from "@wohnplaner/model";
import { pointInPolygon } from "@wohnplaner/model";
import { FURNITURE_BY_ID, ROLES, type Role } from "./furniture";

/** Stilvorlage: setzt Wandfarbe, Boden und Möbeloberflächen eines Raums in einem Schritt. */
export interface Style {
  id: string;
  name: string;
  description: string;
  walls: string;
  floor: string;
  roles: Partial<Record<Role, string>>;
}

export const STYLES: Style[] = [
  {
    id: "landhaus",
    name: "Landhaus",
    description: "Cremeweiße Wände, Eiche natur, weiße Fronten, Holz-Arbeitsplatte, Leinen",
    walls: "#e9e0d2",
    floor: "eiche-natur",
    roles: { front: "#f1ece1", worktop: "eiche-natur", wood: "eiche-natur", fabric: "leinen-natur", frame: "leinen-natur", legs: "eiche-natur", plinth: "#f1ece1", metal: "#8c7a5b" },
  },
  {
    id: "skandinavisch",
    name: "Skandinavisch",
    description: "Reinweiß, helle Eiche, weiße Fronten, hellgraue Stoffe",
    walls: "#f1ece1",
    floor: "eiche-hell",
    roles: { front: "#f1f0ea", worktop: "eiche-hell", wood: "eiche-hell", fabric: "stoff-hellgrau", frame: "stoff-hellgrau", legs: "eiche-hell", plinth: "#f1f0ea", metal: "#c9cbcd" },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Weiß, Fliesen in Betonoptik, anthrazit Fronten, Quarzstein",
    walls: "#f1f0ea",
    floor: "fliese-betongrau-60",
    roles: { front: "#383e42", worktop: "quarz-weiss", wood: "nussbaum", fabric: "stoff-anthrazit", frame: "stoff-anthrazit", legs: "#1e1e1e", plinth: "#383e42", metal: "#2a2a2a" },
  },
  {
    id: "industrial",
    name: "Industrial",
    description: "Lichtgrau, geräucherte Eiche, schwarze Fronten, Beton, Leder",
    walls: "#c5c7c4",
    floor: "eiche-geraeuchert",
    roles: { front: "#2c2c2d", worktop: "beton", wood: "eiche-geraeuchert", fabric: "leder-cognac", frame: "stoff-anthrazit", legs: "#1e1e1e", plinth: "#2c2c2d", metal: "#1e1e1e" },
  },
];

export const STYLE_BY_ID = new Map(STYLES.map((s) => [s.id, s]));

export function furnitureInRoom(room: Room, f: Furniture): boolean {
  return room.polygons.some((poly) => pointInPolygon([f.x, f.y], poly));
}

/** Oberflächen für ein neues Möbel: Katalog-Standard, überschrieben vom Stil des Raums. */
export function defaultFinishes(type: string, room?: Room): Record<string, string> {
  const t = FURNITURE_BY_ID.get(type);
  const style = room?.finishes?.style ? STYLE_BY_ID.get(room.finishes.style) : undefined;
  const out: Record<string, string> = {};
  for (const role of t?.roles ?? []) out[role] = style?.roles[role] ?? ROLES[role].default;
  return out;
}

export function applyStyle(plan: Plan, roomId: string, style: Style): Plan {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return plan;
  return {
    ...plan,
    rooms: plan.rooms.map((r) =>
      r.id === roomId ? { ...r, finishes: { ...r.finishes, walls: style.walls, floor: style.floor, style: style.id } } : r,
    ),
    furniture: plan.furniture.map((f) => {
      if (!furnitureInRoom(room, f)) return f;
      const finishes = { ...f.finishes };
      for (const role of Object.keys(finishes) as Role[]) if (style.roles[role]) finishes[role] = style.roles[role]!;
      return { ...f, finishes };
    }),
  };
}
