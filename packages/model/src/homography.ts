import type { Point } from "./schema";

/** 3×3-Matrix zeilenweise: [h0..h8], x' = (h0 x + h1 y + h2) / (h6 x + h7 y + h8) */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Projektive Abbildung, die vier Punkte `from` auf vier Punkte `to` abbildet. */
export function homography(from: readonly Point[], to: readonly Point[]): Mat3 {
  if (from.length !== 4 || to.length !== 4) throw new Error("homography: genau 4 Punktpaare nötig");
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i]!;
    const [u, v] = to[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gauß-Elimination mit Pivotsuche auf der 8×9-Matrix
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-12) throw new Error("homography: Punkte sind degeneriert");
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  const h = A.map((row, i) => row[8]! / row[i]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(h: Mat3, [x, y]: Point): Point {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] = r[i * 3 + j]! + a[i * 3 + k]! * b[k * 3 + j]!;
  return r;
}

/** CSS `matrix3d(...)` für eine 2D-Homographie (transform-origin: 0 0). */
export function toCssMatrix3d(h: Mat3): string {
  const [a, b, c, d, e, f, g, i, j] = h;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${i},0,0,1,0,${c},${f},0,${j})`;
}
