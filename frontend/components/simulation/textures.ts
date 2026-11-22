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

// ---------- residence halls, matched to UCR Housing Services photos ----------
//
// Each hall texture is two window bays wide and a whole 4-storey wall tall
// (ground floor, upper floors, parapet), so ground floors and parapets can
// differ. Walls of these halls use v = metres above the base (see
// buildGeometry's storey UVs). Colours come from the photos:
//  - Aberdeen-Inverness: warm tan brick, turquoise window/panel strips,
//    white concrete floor bands.
//  - Lothian: salmon stucco, wide white-framed multi-pane windows, light band
//    at each floor.
//  - Pentland Hills: cream stucco over a terracotta ground floor, deep-set
//    square windows with dark frames, a cornice above the ground floor.

/** Metres per window bay for each hall. */
export const HALL_BAY: Record<"ai" | "lothian" | "pentland", number> = { ai: 3.0, lothian: 3.4, pentland: 3.6 };
/** Storey height and the texture's full height (4 storeys + parapet). */
export const HALL_STOREY = 3.4;
export const HALL_TILE_H = 4 * HALL_STOREY + 0.8;
const PPM = 64; // texture pixels per metre

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

/** A window pane with a sky reflection, in canvas pixels. */
function glass(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone = 0) {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, tone ? "#a9bccb" : "#8ea6b8");
  grad.addColorStop(0.5, "#4d6276");
  grad.addColorStop(1, "#2b3744");
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x + w * 0.4, y);
  g.lineTo(x + w * 0.6, y);
  g.lineTo(x + w * 0.2, y + h);
  g.fill();
}

function drawHall(kind: "ai" | "lothian" | "pentland"): HTMLCanvasElement {
  const bay = HALL_BAY[kind];
  const W = Math.round(2 * bay * PPM), H = Math.round(HALL_TILE_H * PPM);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const X = (m: number) => m * PPM;
  const Y = (m: number) => H - m * PPM; // metres above the base -> canvas y
  const rect = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(X(x0), Y(y1), X(x1) - X(x0), Y(y0) - Y(y1));
  };
  const top = 4 * HALL_STOREY;

  if (kind === "ai") {
    // Brick: running bond, slightly varied bricks, pale mortar.
    g.fillStyle = "#dcc6a3";
    g.fillRect(0, 0, W, H);
    const course = 0.1, brick = 0.24;
    for (let r = 0; r * course < HALL_TILE_H; r++) {
      const off = r % 2 ? brick / 2 : 0;
      for (let x = -off; x < 2 * bay; x += brick) {
        const t = Math.random();
        g.fillStyle = t < 0.33 ? "#c4874f" : t < 0.66 ? "#bb7d47" : "#cc915a";
        g.fillRect(X(x) + 1, Y((r + 1) * course) + 1, X(brick) - 2, X(course) - 1.5);
      }
    }
    for (let f = 0; f < 4; f++) {
      const y = f * HALL_STOREY;
      for (let k = 0; k < 2; k++) {
        const x = k * bay;
        // Turquoise panel strip, then the window with a turquoise spandrel.
        rect(x + 0.9, y + 0.2, x + 1.45, y + 3.2, "#2e9692");
        rect(x + 0.93, y + 0.2, x + 0.98, y + 3.2, "rgba(255,255,255,0.18)");
        rect(x + 1.45, y + 0.2, x + 2.4, y + 0.95, "#2a8b87");
        rect(x + 1.42, y + 0.92, x + 2.43, y + 3.0, "#d5d8d8");
        glass(g, X(x + 1.5), Y(y + 2.94), X(0.85), X(1.96));
        rect(x + 1.42, y + 2.1, x + 2.43, y + 2.15, "#d5d8d8");
        // Shadow beside the strip (it stands a little proud of the brick).
        rect(x + 2.43, y + 0.2, x + 2.53, y + 3.2, "rgba(0,0,0,0.12)");
      }
      // White concrete floor band.
      if (f > 0) {
        rect(0, y - 0.12, 2 * bay, y + 0.18, "#ece8df");
        rect(0, y - 0.18, 2 * bay, y - 0.12, "rgba(0,0,0,0.15)");
      }
    }
    // Fascia.
    rect(0, top, 2 * bay, HALL_TILE_H, "#efebe2");
    rect(0, top - 0.08, 2 * bay, top, "rgba(0,0,0,0.18)");
  } else if (kind === "lothian") {
    g.fillStyle = "#dd8a69";
    g.fillRect(0, 0, W, H);
    speckle(g, W, H, 2600, 0.05);
    for (let f = 0; f < 4; f++) {
      const y = f * HALL_STOREY;
      const y0 = f === 0 ? y + 0.45 : y + 0.85, y1 = y + 2.75;
      for (let k = 0; k < 2; k++) {
        const x0 = k * bay + 0.4, x1 = k * bay + bay - 0.4;
        // White frame, glass, then a 3 x 2 grid of white mullions.
        rect(x0 - 0.09, y0 - 0.09, x1 + 0.09, y1 + 0.09, "#f4f2ee");
        glass(g, X(x0), Y(y1), X(x1 - x0), X(y1 - y0), 1);
        for (let m = 1; m < 3; m++) {
          const xm = x0 + ((x1 - x0) * m) / 3;
          rect(xm - 0.04, y0, xm + 0.04, y1, "#f4f2ee");
        }
        const yt = y1 - (y1 - y0) * 0.36;
        rect(x0, yt - 0.04, x1, yt + 0.04, "#f4f2ee");
        // Reveal shadow under the head.
        rect(x0 - 0.09, y1 - 0.02, x1 + 0.09, y1 + 0.09, "rgba(0,0,0,0.12)");
      }
      // Lighter band at the top of each floor.
      rect(0, y + 3.05, 2 * bay, y + 3.32, "#eaa98d");
      rect(0, y + 3.0, 2 * bay, y + 3.05, "rgba(0,0,0,0.12)");
    }
    rect(0, top + 0.55, 2 * bay, HALL_TILE_H, "#f1ece4");
    rect(0, top + 0.5, 2 * bay, top + 0.55, "rgba(0,0,0,0.2)");
  } else {
    // Pentland Hills: terracotta ground floor, cream above.
    g.fillStyle = "#e7dcc7";
    g.fillRect(0, 0, W, H);
    rect(0, 0, 2 * bay, HALL_STOREY, "#cd8463");
    speckle(g, W, H, 2600, 0.045);
    for (let f = 0; f < 4; f++) {
      const y = f * HALL_STOREY;
      for (let k = 0; k < 2; k++) {
        const cx = k * bay + bay / 2;
        const w = f === 0 ? 1.6 : 1.35;
        const x0 = cx - w / 2, x1 = cx + w / 2, y0 = y + 1.0, y1 = y + 2.4;
        rect(x0 - 0.08, y0 - 0.08, x1 + 0.08, y1 + 0.08, "#4b5157");
        glass(g, X(x0), Y(y1), X(w), X(y1 - y0));
        rect((x0 + x1) / 2 - 0.035, y0, (x0 + x1) / 2 + 0.035, y1, "#4b5157");
        // Deep reveal: shadow on the head and one jamb.
        rect(x0, y1 - 0.18, x1, y1, "rgba(0,0,0,0.28)");
        rect(x0, y0, x0 + 0.14, y1, "rgba(0,0,0,0.2)");
        // Sill.
        rect(x0 - 0.15, y0 - 0.2, x1 + 0.15, y0 - 0.06, f === 0 ? "#e9dcc6" : "#f3ecdf");
        rect(x0 - 0.15, y0 - 0.26, x1 + 0.15, y0 - 0.2, "rgba(0,0,0,0.15)");
      }
    }
    // Cornice over the ground floor.
    rect(0, HALL_STOREY - 0.05, 2 * bay, HALL_STOREY + 0.28, "#f3ede1");
    rect(0, HALL_STOREY - 0.13, 2 * bay, HALL_STOREY - 0.05, "rgba(0,0,0,0.2)");
    // Eave line and the shadow of the roof overhang.
    rect(0, top + 0.35, 2 * bay, HALL_TILE_H, "#f3ede1");
    const sh = g.createLinearGradient(0, Y(HALL_TILE_H), 0, Y(HALL_TILE_H - 0.9));
    sh.addColorStop(0, "rgba(0,0,0,0.32)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sh;
    g.fillRect(0, Y(HALL_TILE_H), W, X(0.9));
  }
  return c;
}

export function hallFacadeTexture(kind: "ai" | "lothian" | "pentland"): THREE.Texture {
  const key = `hall-${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(drawHall(kind));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / (2 * HALL_BAY[kind]), 1 / HALL_TILE_H);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

/** Standing-seam metal roofing: seams run down the slope (texture v). */
export function seamTexture(): THREE.Texture {
  const hit = cache.get("seam");
  if (hit) return hit;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#eeeeee";
  g.fillRect(0, 0, size, size);
  speckle(g, size, size, 1500, 0.03);
  const n = 8; // seams per tile
  for (let k = 0; k < n; k++) {
    const x = (k * size) / n;
    g.fillStyle = "#ffffff";
    g.fillRect(x, 0, 3, size);
    g.fillStyle = "#b9b9b9";
    g.fillRect(x + 3, 0, 2, size);
    g.fillStyle = "rgba(0,0,0,0.04)";
    g.fillRect(x + 5, 0, size / n - 8, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 3.6, 1 / 3.6); // 0.45 m between seams
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set("seam", tex);
  return tex;
}
