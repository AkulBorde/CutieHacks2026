// Owner: simulation
//
// Facade textures drawn on a canvas at runtime, so there are no image files to
// license or download. Each texture is one window bay by one storey; the wall
// UVs are in metres, so `repeat` sets the bay width and floor height.
import * as THREE from "three";

type FacadeSpec = {
  bay: number; // metres per window bay
  floor: number; // metres per storey
  win: [number, number, number, number]; // x0, x1, y0, y1 as fractions (y from bottom)
  mullions?: number; // vertical glass divisions
  sill?: boolean;
  band?: boolean; // concrete band between floors (UCR campus look)
};

export const FACADES: Record<string, FacadeSpec> = {
  campus: { bay: 3.4, floor: 3.4, win: [0.1, 0.9, 0.3, 0.82], mullions: 3, band: true },
  housing: { bay: 2.9, floor: 3.4, win: [0.28, 0.72, 0.34, 0.8], mullions: 1, sill: true },
  house: { bay: 4.2, floor: 4.6, win: [0.34, 0.66, 0.3, 0.62], mullions: 1, sill: true },
  minor: { bay: 6, floor: 3, win: [0, 0, 0, 0] },
};

function drawFacade(spec: FacadeSpec, size = 256): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  // White base: the building's vertex colour tints it.
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  // Faint stucco speckle.
  for (let i = 0; i < 900; i++) {
    const v = 235 + Math.floor(Math.random() * 20);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  if (spec.band) {
    g.fillStyle = "#e9e6e0";
    g.fillRect(0, size * 0.04, size, size * 0.1);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, size * 0.04, size, 2);
  }
  const [x0, x1, y0, y1] = spec.win;
  if (x1 > x0) {
    const X0 = x0 * size, X1 = x1 * size;
    const Y0 = size - y1 * size, Y1 = size - y0 * size; // canvas y runs downward
    // Frame
    g.fillStyle = "#5a5f66";
    g.fillRect(X0 - 4, Y0 - 4, X1 - X0 + 8, Y1 - Y0 + 8);
    // Glass with a sky reflection gradient
    const grad = g.createLinearGradient(0, Y0, 0, Y1);
    grad.addColorStop(0, "#7e95ab");
    grad.addColorStop(0.45, "#3c4f63");
    grad.addColorStop(1, "#26313d");
    g.fillStyle = grad;
    g.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
    // Diagonal glint
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.beginPath();
    g.moveTo(X0, Y1);
    g.lineTo(X0 + (X1 - X0) * 0.35, Y0);
    g.lineTo(X0 + (X1 - X0) * 0.55, Y0);
    g.lineTo(X0 + (X1 - X0) * 0.2, Y1);
    g.fill();
    // Mullions
    g.fillStyle = "#5a5f66";
    const m = spec.mullions ?? 0;
    for (let k = 1; k <= m; k++) {
      const x = X0 + ((X1 - X0) * k) / (m + 1);
      g.fillRect(x - 2, Y0, 4, Y1 - Y0);
    }
    g.fillRect(X0, Y0 + (Y1 - Y0) * 0.62, X1 - X0, 3);
    if (spec.sill) {
      g.fillStyle = "#f4f1ea";
      g.fillRect(X0 - 8, Y1 + 2, X1 - X0 + 16, 7);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(X0 - 8, Y1 + 9, X1 - X0 + 16, 3);
    }
  }
  return c;
}

const cache = new Map<string, THREE.Texture>();

export function facadeTexture(style: keyof typeof FACADES): THREE.Texture {
  const hit = cache.get(style);
  if (hit) return hit;
  const spec = FACADES[style];
  const tex = new THREE.CanvasTexture(drawFacade(spec));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / spec.bay, 1 / spec.floor);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(style, tex);
  return tex;
}

/** Subtle noise for roofs and ground, so big flat areas don't look plastic. */
export function noiseTexture(scale: number, contrast = 22): THREE.Texture {
  const key = `noise${scale}-${contrast}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 255 - Math.floor(Math.random() * contrast);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / scale, 1 / scale);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
