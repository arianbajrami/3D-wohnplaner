import { z } from "zod";
import { roomAt, wallGeometry, wallSideRooms } from "./geometry";
import { Furniture, Room, Wall, type Plan } from "./schema";

/**
 * Variante = Gestaltung über einem Grundriss: Oberflächen und Möbel.
 * Der Grundriss selbst (Wände, Öffnungen, Raumpolygone, Raumnamen) liegt in plans/<plan>.json
 * und ist für alle Varianten gleich. So wirkt eine Korrektur am Grundriss auf alle Varianten.
 */
export const VARIANT_SCHEMA_VERSION = 1 as const;

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "nur a–z, 0–9 und Bindestrich");

export const Variant = z.object({
  schemaVersion: z.literal(VARIANT_SCHEMA_VERSION),
  id: Slug,
  name: z.string().min(1),
  /** Kürzel der Person, z. B. "arian", "leni" */
  author: Slug,
  /** Schlüssel des Grundrisses, z. B. "1og" */
  plan: Slug,
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  rooms: z.record(z.string(), z.object({ finishes: Room.shape.finishes })).default({}),
  walls: z.record(z.string(), z.object({ finishes: Wall.shape.finishes, removed: z.boolean().optional() })).default({}),
  furniture: z.array(Furniture).default([]),
});
export type Variant = z.infer<typeof Variant>;

/** Grundriss ohne Gestaltung (so wird er in plans/ gespeichert). */
export function stripDesign(plan: Plan): Plan {
  return {
    ...plan,
    rooms: plan.rooms.map(({ finishes: _f, ...r }) => r),
    walls: plan.walls.map(({ finishes: _f, removed: _r, ...w }) => w),
    furniture: [],
  };
}

/** Gestaltung einer Variante auf einen Grundriss anwenden. */
export function applyVariant(base: Plan, v: Pick<Variant, "rooms" | "walls" | "furniture">): Plan {
  const plain = stripDesign(base);
  return {
    ...plain,
    rooms: plain.rooms.map((r) => (v.rooms[r.id]?.finishes ? { ...r, finishes: v.rooms[r.id]!.finishes } : r)),
    walls: plain.walls.map((w) => {
      const d = v.walls[w.id];
      if (!d) return w;
      return { ...w, ...(d.finishes ? { finishes: d.finishes } : {}), ...(d.removed ? { removed: true } : {}) };
    }),
    furniture: v.furniture,
  };
}

/** Gestaltung aus einem bearbeiteten Modell herauslösen. */
export function extractDesign(plan: Plan): Pick<Variant, "rooms" | "walls" | "furniture"> {
  const rooms: Variant["rooms"] = {};
  for (const r of plan.rooms) if (r.finishes && Object.values(r.finishes).some(Boolean)) rooms[r.id] = { finishes: r.finishes };
  const walls: Variant["walls"] = {};
  for (const w of plan.walls) {
    const painted = w.finishes && Object.values(w.finishes).some(Boolean);
    if (painted || w.removed) walls[w.id] = { finishes: painted ? w.finishes : undefined, ...(w.removed ? { removed: true } : {}) };
  }
  return { rooms, walls, furniture: plan.furniture };
}

/** Gleiche Gestaltung? (Reihenfolge der Schlüssel egal) */
export function sameDesign(a: Pick<Variant, "rooms" | "walls" | "furniture">, b: Pick<Variant, "rooms" | "walls" | "furniture">): boolean {
  const pick = (d: typeof a) => ({ rooms: d.rooms, walls: d.walls, furniture: d.furniture });
  return stableJson(pick(a)) === stableJson(pick(b));
}

function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

/** Aus einem Namen ein Datei-taugliches Kürzel machen: „Küche Landhaus“ → "kueche-landhaus" */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "variante";
}

export interface RoomDiff {
  roomId: string;
  name: string;
  floor: [string | undefined, string | undefined];
  walls: [string | undefined, string | undefined];
  style: [string | undefined, string | undefined];
  furniture: [string[], string[]];
  accentWalls: [number, number];
  /** entfernte Wände, die an den Raum grenzen */
  removedWalls: [number, number];
  differs: boolean;
}

/** Raum für Raum: was unterscheidet zwei Varianten? */
export function compareDesigns(base: Plan, a: Plan, b: Plan): RoomDiff[] {
  const roomOf = (p: Plan, x: number, y: number) => roomAt(p, [x, y])?.id;
  // Anzahl gestrichener Wandseiten (Akzentwände), die zu einem Raum zeigen
  const sideRoomsCount = (p: Plan, roomId: string) =>
    p.walls.filter((w) => {
      if (!w.finishes) return false;
      const sides = wallSideRooms(p, wallGeometry(p, w));
      return (w.finishes.left && sides.left === roomId) || (w.finishes.right && sides.right === roomId);
    }).length;
  const removedCount = (p: Plan, roomId: string) =>
    p.walls.filter((w) => {
      if (!w.removed) return false;
      const sides = wallSideRooms(p, wallGeometry(p, w));
      return sides.left === roomId || sides.right === roomId;
    }).length;
  return base.rooms.map((r) => {
    const ra = a.rooms.find((x) => x.id === r.id), rb = b.rooms.find((x) => x.id === r.id);
    const fa = a.furniture.filter((f) => roomOf(a, f.x, f.y) === r.id).map((f) => f.type).sort();
    const fb = b.furniture.filter((f) => roomOf(b, f.x, f.y) === r.id).map((f) => f.type).sort();
    const d: RoomDiff = {
      roomId: r.id,
      name: r.name,
      floor: [ra?.finishes?.floor, rb?.finishes?.floor],
      walls: [ra?.finishes?.walls, rb?.finishes?.walls],
      style: [ra?.finishes?.style, rb?.finishes?.style],
      furniture: [fa, fb],
      accentWalls: [sideRoomsCount(a, r.id), sideRoomsCount(b, r.id)],
      removedWalls: [removedCount(a, r.id), removedCount(b, r.id)],
      differs: false,
    };
    const fur = (l: string[], m: string[]) =>
      JSON.stringify(l) !== JSON.stringify(m) ||
      stableJson(a.furniture.filter((f) => roomOf(a, f.x, f.y) === r.id)) !== stableJson(b.furniture.filter((f) => roomOf(b, f.x, f.y) === r.id));
    d.differs =
      d.floor[0] !== d.floor[1] || d.walls[0] !== d.walls[1] || d.accentWalls[0] !== d.accentWalls[1] || d.removedWalls[0] !== d.removedWalls[1] || fur(fa, fb);
    return d;
  });
}
