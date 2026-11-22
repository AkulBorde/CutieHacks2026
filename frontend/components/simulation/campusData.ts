// Owner: simulation
//
import { PENTLAND_LETTERS } from "./realPlans";
import { toScene } from "./geo";
import { UCR_BOUNDARY } from "./ucrBoundary";

// Types for public/ucr/campus.json (built by scripts/build-campus-data.mjs)
// and the rules that turn OSM tags into heights and building styles.

export type Ring = number[]; // flat [x0, z0, x1, z1, ...] in scene metres

export type CampusBuilding = {
  id: string;
  name: string;
  type: string;
  part: boolean;
  levels: number;
  height: number;
  minHeight: number;
  roof: string;
  amenity: string;
  outer: Ring;
  holes: Ring[];
  housing?: string;
  housingKind?: "residence_hall" | "apartments";
  area: number;
  center: [number, number];
};

export type CampusRoad = {
  kind: string;
  name: string;
  sub: string;
  lanes: number;
  line: Ring;
};

export type CampusArea = { kind: string; name: string; ring: Ring; holes: Ring[] };

export type CampusData = {
  version: number;
  origin: { lat: number; lng: number };
  attribution: string;
  housing: { name: string; kind: "residence_hall" | "apartments" }[];
  buildings: CampusBuilding[];
  roads: CampusRoad[];
  areas: CampusArea[];
  trees: number[];
};

export type Style = "campus" | "housing" | "house" | "minor" | HallStyle;
/** Residence halls with their own look, matched to UCR Housing photos. */
export type HallStyle = "ai" | "lothian" | "pentland";
export const STYLES: Style[] = ["campus", "housing", "house", "minor", "ai", "lothian", "pentland"];
const HALL_STYLES: Record<string, HallStyle> = {
  "Aberdeen-Inverness": "ai",
  Lothian: "lothian",
  "Pentland Hills": "pentland",
};
export function isHallStyle(s: Style): s is HallStyle {
  return s === "ai" || s === "lothian" || s === "pentland";
}

const HOUSE_TYPES = new Set([
  "house", "detached", "residential", "semidetached_house", "static_caravan",
  "bungalow", "terrace",
]);
const MINOR_TYPES = new Set(["garage", "garages", "shed", "carport", "roof", "hut"]);

// Storeys for housing communities that OSM leaves blank.
const HOUSING_LEVELS: Record<string, number> = {
  "Aberdeen-Inverness": 4,
  Lothian: 4,
  Dundee: 7, // two L-shaped seven-storey buildings
  "Pentland Hills": 4,
  "North District": 5,
  "Glen Mor": 4,
  Bannockburn: 3,
  Falkirk: 2,
  Oban: 2,
  Plaza: 2,
  Stonehaven: 3,
};

export const FLOOR_HEIGHT = 3.4;

export function styleOf(b: CampusBuilding): Style {
  if (b.housing) return HALL_STYLES[b.housing] ?? "housing";
  if (MINOR_TYPES.has(b.type)) return "minor";
  if (HOUSE_TYPES.has(b.type)) return "house";
  if (b.type === "yes" && b.area < 260 && !b.name) return "house";
  if (b.type === "apartments") return "housing";
  return "campus";
}

/** Top-of-wall height in metres. */
export function heightOf(b: CampusBuilding): number {
  if (b.height > 0) return b.height;
  if (b.levels > 0) return b.levels * FLOOR_HEIGHT + 0.8;
  if (b.housing) return (HOUSING_LEVELS[b.housing] ?? 3) * FLOOR_HEIGHT + 0.8;
  switch (styleOf(b)) {
    case "ai":
    case "lothian":
    case "pentland":
      return 4 * FLOOR_HEIGHT + 0.8;
    case "minor":
      return b.type === "roof" || b.type === "carport" ? 3.2 : 3;
    case "house":
      return b.type === "static_caravan" ? 3.2 : 4.6;
    case "housing":
      return 2.5 * FLOOR_HEIGHT;
  }
  // Campus buildings: bigger footprints tend to be taller at UCR.
  if (b.type === "church") return 9;
  if (b.area > 6000) return 4 * FLOOR_HEIGHT + 1;
  if (b.area > 2500) return 3 * FLOOR_HEIGHT + 1;
  if (b.area > 600) return 2 * FLOOR_HEIGHT + 1;
  return FLOOR_HEIGHT + 1;
}

/** A small, stable hash so each building keeps the same tint every load. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Housing community (or building name) -> indexes of its buildings. */
export function hallIndexOf(data: CampusData): Map<string, number[]> {
  const m = new Map<string, number[]>();
  data.buildings.forEach((b, i) => {
    const key = b.housing ?? (b.name || null);
    if (!key) return;
    (m.get(key) ?? m.set(key, []).get(key)!).push(i);
  });
  return m;
}

/**
 * Loads the saved campus. If it hasn't been saved yet, downloads it from
 * OpenStreetMap and (in dev) saves it to public/ucr/campus.json for next time.
 */
/**
 * OpenStreetMap leaves most Pentland Hills buildings unnamed. The community
 * map identifies all of them (A-Q), so tag them here.
 */
export function fixHousing(data: CampusData): CampusData {
  for (const b of data.buildings) {
    // Lothian's residential restaurant is a low building (OSM has no height);
    // only the empty wing letter C is on it, so no rooms move.
    if (b.id === "w488206039" && !b.levels && !b.height) b.levels = 2;
    if (PENTLAND_LETTERS[b.id]) {
      b.housing = "Pentland Hills";
      b.housingKind = "residence_hall";
    }
  }
  return data;
}

/** Things within this many metres of the campus boundary are kept. */
export const CAMPUS_BUFFER = 20;

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + t * dx - px, az + t * dz - pz);
}

/** UCR's boundary (OSM relation 1634776) in scene metres, flat [x, z, ...] rings. */
export const CAMPUS_RINGS: Ring[] = UCR_BOUNDARY.map((r) => r.flatMap(([lat, lng]) => toScene(lat, lng)));

/** Bounding box of the campus (plus the buffer), in scene metres. */
export const CAMPUS_BOUNDS = (() => {
  const xs = CAMPUS_RINGS.flatMap((r) => r.filter((_, i) => i % 2 === 0));
  const zs = CAMPUS_RINGS.flatMap((r) => r.filter((_, i) => i % 2 === 1));
  const B = CAMPUS_BUFFER;
  return { x0: Math.min(...xs) - B, x1: Math.max(...xs) + B, z0: Math.min(...zs) - B, z1: Math.max(...zs) + B };
})();

/** True if (x, z) is on campus or within CAMPUS_BUFFER metres of it. */
export function nearCampus(x: number, z: number, buffer = CAMPUS_BUFFER): boolean {
  const bb = CAMPUS_BOUNDS;
  if (x < bb.x0 - buffer || x > bb.x1 + buffer || z < bb.z0 - buffer || z > bb.z1 + buffer) return false;
  for (const r of CAMPUS_RINGS) {
    let inside = false;
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      if (distToSeg(x, z, xi, zi, xj, zj) <= buffer) return true;
    }
    if (inside) return true;
  }
  return false;
}

/** Cut a polyline to the parts near campus, ending each piece at the edge. */
function clipLine(line: Ring): Ring[] {
  const out: Ring[] = [];
  let cur: number[] = [];
  const flush = () => {
    if (cur.length >= 4) out.push(cur);
    cur = [];
  };
  const n = line.length / 2;
  for (let i = 0; i < n; i++) {
    const x = line[i * 2], z = line[i * 2 + 1];
    if (i === 0) {
      if (nearCampus(x, z)) cur.push(x, z);
      continue;
    }
    const px = line[i * 2 - 2], pz = line[i * 2 - 1];
    const len = Math.hypot(x - px, z - pz);
    // Walk long segments in 10 m steps so a road that only clips a corner
    // of campus (or ends just past it) is cut at the edge.
    const steps = Math.max(1, Math.ceil(len / 10));
    let prevIn = nearCampus(px, pz);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const qx = px + (x - px) * t, qz = pz + (z - pz) * t;
      const inNow = nearCampus(qx, qz);
      if (inNow !== prevIn) {
        // Edge crossing: refine where it happens.
        let lo = (k - 1) / steps, hi = t;
        for (let it = 0; it < 8; it++) {
          const mid = (lo + hi) / 2;
          if (nearCampus(px + (x - px) * mid, pz + (z - pz) * mid) === prevIn) lo = mid;
          else hi = mid;
        }
        const m = prevIn ? lo : hi;
        cur.push(px + (x - px) * m, pz + (z - pz) * m);
        if (prevIn) flush();
      }
      prevIn = inNow;
    }
    if (prevIn) cur.push(x, z);
  }
  flush();
  return out;
}

/**
 * Keep the map to UCR: drop every building, road, lawn, parking lot and tree
 * more than CAMPUS_BUFFER metres outside the campus boundary (UCR housing is
 * always kept).
 */
export function trimToCampus(data: CampusData): CampusData {
  data.buildings = data.buildings.filter((b) => {
    if (b.housing) return true;
    if (nearCampus(b.center[0], b.center[1])) return true;
    const n = b.outer.length / 2, step = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i += step) if (nearCampus(b.outer[i * 2], b.outer[i * 2 + 1])) return true;
    return false;
  });
  data.roads = data.roads.flatMap((r) => clipLine(r.line).map((line) => ({ ...r, line })));
  data.areas = data.areas.filter((a) => {
    const n = a.ring.length / 2;
    let k = 0;
    for (let i = 0; i < n; i++) if (nearCampus(a.ring[i * 2], a.ring[i * 2 + 1])) k++;
    return k >= n / 2;
  });
  const trees: number[] = [];
  for (let i = 0; i < data.trees.length; i += 2) if (nearCampus(data.trees[i], data.trees[i + 1])) trees.push(data.trees[i], data.trees[i + 1]);
  data.trees = trees;
  return data;
}

export async function loadCampus(onStatus?: (s: string) => void): Promise<CampusData> {
  const res = await fetch("/ucr/campus.json").catch(() => null);
  if (res?.ok) {
    try {
      return trimToCampus(fixHousing(await res.json()));
    } catch {
      // fall through and re-download
    }
  }
  const { downloadCampus } = await import("./osmToCampus");
  const data = trimToCampus(fixHousing(await downloadCampus(onStatus)));
  fetch("/api/sim/campus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).catch(() => {});
  return data;
}
