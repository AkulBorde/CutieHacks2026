// Owner: simulation
//
import { PENTLAND_LETTERS } from "./realPlans";

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

export type Style = "campus" | "housing" | "house" | "minor";

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
  if (b.housing) return "housing";
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
    if (PENTLAND_LETTERS[b.id]) {
      b.housing = "Pentland Hills";
      b.housingKind = "residence_hall";
    }
  }
  return data;
}

export async function loadCampus(onStatus?: (s: string) => void): Promise<CampusData> {
  const res = await fetch("/ucr/campus.json").catch(() => null);
  if (res?.ok) {
    try {
      return fixHousing(await res.json());
    } catch {
      // fall through and re-download
    }
  }
  const { downloadCampus } = await import("./osmToCampus");
  const data = fixHousing(await downloadCampus(onStatus));
  fetch("/api/sim/campus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).catch(() => {});
  return data;
}
