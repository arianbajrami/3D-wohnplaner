import * as THREE from "three";
import { resolveFinish, type Material } from "./catalog/materials";

/** Einfacher deterministischer Zufall, damit Texturen bei jedem Laden gleich aussehen */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * f)));
  return `#${c.getHexString()}`;
}

const PX = 512;

/** Kantenlänge in Metern, die eine Textur abdeckt */
export function textureSpan(m: Material): number {
  if (m.pattern === "tiles") return (m.module ?? 0.3) * Math.max(1, Math.round(1.2 / (m.module ?? 0.3)));
  if (m.pattern === "planks") return (m.module ?? 0.19) * 10;
  return 1;
}

function drawTexture(m: Material): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = PX;
  const g = cv.getContext("2d")!;
  const r = rng([...m.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  g.fillStyle = m.color;
  g.fillRect(0, 0, PX, PX);

  if (m.pattern === "planks") {
    const rows = 10, rh = PX / rows;
    for (let row = 0; row < rows; row++) {
      let x = -r() * PX;
      while (x < PX) {
        const len = PX * (0.35 + r() * 0.5);
        const col = shade(m.color, 0.88 + r() * 0.22);
        g.fillStyle = col;
        // Dielen über den Rand hinaus zeichnen, damit die Textur nahtlos kachelt
        for (const dx of [0, PX]) g.fillRect(x - dx, row * rh, len, rh);
        g.strokeStyle = shade(col, 0.82);
        g.globalAlpha = 0.35;
        for (let k = 0; k < 4; k++) {
          const y = row * rh + r() * rh;
          g.beginPath();
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.6, y + (r() - 0.5) * 6, x + len, y);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = shade(m.color, 0.6);
        g.fillRect(x, row * rh, 1.5, rh);
        x += len;
      }
      g.fillStyle = shade(m.color, 0.6);
      g.fillRect(0, row * rh, PX, 1.5);
    }
  } else if (m.pattern === "tiles") {
    const n = Math.round(textureSpan(m) / (m.module ?? 0.3)), t = PX / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = shade(m.color, 0.95 + r() * 0.1);
        g.fillRect(i * t, j * t, t, t);
      }
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(m.color).getHSL(hsl);
    // Fugen: auf dunklen Fliesen heller, auf hellen dunkler
    g.fillStyle = shade(m.color, hsl.l < 0.4 ? 1.5 : 0.82);
    for (let i = 0; i <= n; i++) {
      g.fillRect(i * t - 1.5, 0, 3, PX);
      g.fillRect(0, i * t - 1.5, PX, 3);
    }
  } else if (m.pattern === "stone" || m.pattern === "fabric") {
    const count = m.pattern === "stone" ? 9000 : 25000, size = m.pattern === "stone" ? 2.5 : 1.2;
    for (let k = 0; k < count; k++) {
      g.fillStyle = shade(m.color, 0.85 + r() * 0.3);
      g.globalAlpha = 0.5;
      g.fillRect(r() * PX, r() * PX, size, size);
    }
    g.globalAlpha = 1;
  }
  return cv;
}

const textureCache = new Map<string, THREE.Texture>();
function textureFor(m: Material, world: boolean): THREE.Texture {
  const key = `${m.id}|${world}`;
  let t = textureCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(drawTexture(m));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    // Böden: UV-Koordinaten sind Meter → eine Textur deckt textureSpan Meter ab
    if (world) t.repeat.set(1 / textureSpan(m), 1 / textureSpan(m));
    textureCache.set(key, t);
  }
  return t;
}

const materialCache = new Map<string, THREE.Material>();

/**
 * Three.js-Material für eine Oberfläche ("#rrggbb" oder Material-ID).
 * `world`: Textur in echten Metern kacheln (für Böden), sonst einmal pro Fläche.
 */
export function finishMaterial(finish: string, opts: { world?: boolean; glass?: boolean } = {}): THREE.Material {
  const key = `${finish}|${opts.world ? 1 : 0}|${opts.glass ? 1 : 0}`;
  let mat = materialCache.get(key);
  if (!mat) {
    const res = resolveFinish(finish);
    if (opts.glass) {
      mat = new THREE.MeshStandardMaterial({ color: res.color, transparent: true, opacity: 0.35, roughness: 0.1 });
    } else if (res.material && res.material.pattern !== "plain") {
      mat = new THREE.MeshStandardMaterial({ map: textureFor(res.material, !!opts.world), roughness: 0.75 });
    } else {
      const glossy = res.material?.id === "leder-cognac";
      mat = new THREE.MeshStandardMaterial({ color: res.color, roughness: glossy ? 0.45 : 0.85 });
    }
    materialCache.set(key, mat);
  }
  return mat;
}
