import { z } from "zod";

/**
 * Kanonisches Grundriss-Modell (Schema-Version 2).
 *
 * Konventionen:
 * - Alle Längen in Metern.
 * - 2D-Koordinaten: x nach rechts, y nach unten (wie Bild/Plan). In 3D wird y zu z.
 * - Wände sind Mittellinien zwischen zwei Knoten; Wände, die sich treffen, teilen Knoten.
 */
export const SCHEMA_VERSION = 2 as const;

/**
 * Oberfläche: entweder eine Farbe ("#rrggbb") oder die ID eines Materials aus dem Katalog der App
 * (z. B. "eiche-hell", "fliese-grau-60"). Das Modell kennt den Katalog nicht, nur den Verweis.
 */
export const Finish = z.string().min(1);

const Id = z.string().min(1);
const Meters = z.number().finite();
const Positive = z.number().finite().positive();
export const Point = z.tuple([Meters, Meters]);

export const Node = z.object({ id: Id, x: Meters, y: Meters });

export const Wall = z.object({
  id: Id,
  a: Id,
  b: Id,
  thickness: Positive,
  /** Überschreibt meta.defaultWallHeight */
  height: Positive.optional(),
  kind: z.enum(["exterior", "interior"]),
  /** Abweichende Oberfläche je Wandseite (Akzentwand). left = Seite der Normalen links von a→b. */
  finishes: z.object({ left: Finish.optional(), right: Finish.optional() }).optional(),
  /**
   * In dieser Gestaltungsvariante entfernt (z. B. offene Küche). Gehört zur Variante, nicht zum
   * Grundriss: im Grundriss bleibt die Wand erhalten.
   */
  removed: z.boolean().optional(),
});

export const Opening = z.object({
  id: Id,
  wall: Id,
  /** door = Tür, window = Fenster, passage = Durchgang ohne Türblatt */
  kind: z.enum(["door", "window", "passage"]),
  /** Abstand der Öffnungsmitte vom Wandknoten a */
  offset: Meters,
  width: Positive,
  height: Positive,
  /** Brüstungshöhe über Fertigfußboden */
  sill: z.number().finite().min(0),
  /** Türanschlag: an welchem Ende die Bänder sitzen, und zu welcher Wandseite die Tür aufgeht */
  hinge: z.enum(["a", "b"]).optional(),
  swing: z.enum(["left", "right"]).optional(),
});

export const Room = z.object({
  id: Id,
  name: z.string(),
  /** Ein Raum kann aus mehreren Teilflächen bestehen (z. B. L-förmiger Flur mit Durchgang). */
  polygons: z.array(z.array(Point).min(3)).min(1),
  apartment: Id.optional(),
  /** false z. B. für das Treppenhaus */
  countsAsLivingArea: z.boolean().default(true),
  /** Fläche laut Quelle (Plan-Beschriftung) als Kontrollwert */
  targetArea: Positive.optional(),
  finishes: z
    .object({
      floor: Finish.optional(),
      /** Standardfarbe aller Wandseiten, die zu diesem Raum zeigen */
      walls: Finish.optional(),
      /** zuletzt angewendete Stilvorlage (nur zur Anzeige) */
      style: z.string().optional(),
    })
    .optional(),
});

export const Apartment = z.object({
  id: Id,
  name: z.string(),
  targetArea: Positive.optional(),
});

export const Furniture = z.object({
  id: Id,
  /** Katalog-Typ der App, z. B. "sofa-3", "kuechen-unterschrank" */
  type: z.string(),
  name: z.string().optional(),
  /** Mittelpunkt in der Ebene */
  x: Meters,
  y: Meters,
  /** Drehung um die Hochachse in Grad (im Uhrzeigersinn in der Draufsicht) */
  rotation: z.number().finite().default(0),
  /** Höhe der Unterkante über dem Boden (z. B. Oberschränke) */
  elevation: z.number().finite().min(0).default(0),
  width: Positive,
  depth: Positive,
  height: Positive,
  /** Oberflächen je Rolle, z. B. { front: "#ffffff", worktop: "holz-eiche" } */
  finishes: z.record(z.string(), Finish).default({}),
});

export const Calibration = z.object({
  /** Vier Punkte im Foto (Pixel) … */
  imagePoints: z.array(Point).length(4),
  /** … und die zugehörigen Punkte im Modell (Meter) */
  modelPoints: z.array(Point).length(4),
});

export const Source = z.object({
  kind: z.enum(["photo", "pdf", "dxf", "manual"]),
  file: z.string().optional(),
  imageSize: z.tuple([Positive, Positive]).optional(),
  calibration: Calibration.optional(),
});

export const Plan = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  meta: z.object({
    name: z.string(),
    floor: z.string().optional(),
    unit: z.literal("m"),
    defaultWallHeight: Positive,
    notes: z.array(z.string()).default([]),
    source: Source.optional(),
  }),
  apartments: z.array(Apartment).default([]),
  nodes: z.array(Node),
  walls: z.array(Wall),
  openings: z.array(Opening).default([]),
  rooms: z.array(Room).default([]),
  furniture: z.array(Furniture).default([]),
});

export type Point = z.infer<typeof Point>;
export type Node = z.infer<typeof Node>;
export type Wall = z.infer<typeof Wall>;
export type Opening = z.infer<typeof Opening>;
export type Room = z.infer<typeof Room>;
export type Apartment = z.infer<typeof Apartment>;
export type Furniture = z.infer<typeof Furniture>;
export type Calibration = z.infer<typeof Calibration>;
export type Plan = z.infer<typeof Plan>;
