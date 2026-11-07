export type Selection = { kind: "room"; id: string } | { kind: "furniture"; id: string } | { kind: "wall"; id: string } | undefined;

export const isRoom = (s: Selection, id: string) => s?.kind === "room" && s.id === id;
export const isFurniture = (s: Selection, id: string) => s?.kind === "furniture" && s.id === id;
export const isWall = (s: Selection, id: string) => s?.kind === "wall" && s.id === id;
