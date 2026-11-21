// Owner: simulation
//
// Downloads UCR from OpenStreetMap (Overpass API) and converts it to the
// compact CampusData the 3D scene draws. Runs in the browser. The first load
// in `next dev` also saves the result to public/ucr/campus.json (see
// app/api/sim/campus/route.ts), so after that the demo works offline.
//
// Map data © OpenStreetMap contributors, ODbL.
import type { CampusArea, CampusBuilding, CampusData, CampusRoad, Ring } from "./campusData";
import { ORIGIN } from "./geo";

// South, west, north, east: the whole campus plus the housing and the
// neighbourhoods around it.
const BBOX = "33.962,-117.345,33.990,-117.310";

export const OVERPASS_QUERY = `[out:json][timeout:90];(
way["building"](${BBOX});
relation["building"](${BBOX});
way["building:part"](${BBOX});
way["highway"](${BBOX});
way["landuse"~"grass|recreation_ground|meadow|farmland|orchard|construction"](${BBOX});
way["leisure"~"park|pitch|garden|track|stadium|sports_centre|swimming_pool"](${BBOX});
way["natural"~"wood|scrub|water|tree_row|grassland"](${BBOX});
way["amenity"="parking"](${BBOX});
);out geom;
node["natural"="tree"](${BBOX});out;`;

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Every UCR housing community. `match` finds named OSM buildings; `near`
// claims unnamed buildings within r metres of a point (scene coordinates of
// the OSM place node for that community).
export const HOUSING: {
  name: string;
  kind: "residence_hall" | "apartments";
  match: RegExp;
  near?: [number, number, number][];
}[] = [
  { name: "Aberdeen-Inverness", kind: "residence_hall", match: /aberdeen|inverness/i },
  { name: "Lothian", kind: "residence_hall", match: /lothian/i },
  { name: "Dundee", kind: "residence_hall", match: /dundee|glasgow/i },
  { name: "Pentland Hills", kind: "residence_hall", match: /pentland/i, near: [[501, -456, 85]] },
  { name: "North District", kind: "apartments", match: /north district/i },
  { name: "Glen Mor", kind: "apartments", match: /glen mor/i, near: [[738, -469, 95], [698, -299, 80]] },
  { name: "Bannockburn", kind: "apartments", match: /bannockburn/i, near: [[-426, -415, 45]] },
  { name: "Falkirk", kind: "apartments", match: /falkirk/i },
  { name: "Oban", kind: "apartments", match: /oban/i },
  { name: "Plaza", kind: "apartments", match: /plaza apartment/i },
  { name: "Stonehaven", kind: "apartments", match: /stonehaven/i },
];

type OsmPoint = { lat: number; lon: number };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: OsmPoint[];
  members?: { type: string; role: string; geometry?: OsmPoint[] }[];
};

const M_LAT = 110_574;
const M_LNG = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const r1 = (v: number) => Math.round(v * 10) / 10;

function project(geom: OsmPoint[]): Ring {
  const out: Ring = [];
  for (const p of geom) out.push(r1((p.lon - ORIGIN.lng) * M_LNG), r1(-(p.lat - ORIGIN.lat) * M_LAT));
  // OSM closes rings by repeating the first node; drop the repeat.
  const n = out.length;
  if (n >= 4 && out[0] === out[n - 2] && out[1] === out[n - 1]) out.length = n - 2;
  return out;
}

const num = (s?: string) => {
  if (s === undefined) return 0;
  const v = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

function centroid(ring: Ring): [number, number] {
  let x = 0, z = 0;
  const n = ring.length / 2;
  for (let i = 0; i < ring.length; i += 2) { x += ring[i]; z += ring[i + 1]; }
  return [x / n, z / n];
}

function area(ring: Ring): number {
  let s = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    s += ring[i] * ring[j + 1] - ring[j] * ring[i + 1];
  }
  return Math.abs(s / 2);
}

export function osmToCampus(raw: { elements: OsmElement[] }): CampusData {
  const buildings: CampusBuilding[] = [];
  const roads: CampusRoad[] = [];
  const areas: CampusArea[] = [];
  const trees: number[] = [];

  for (const e of raw.elements) {
    const t = e.tags ?? {};
    if (e.type === "node") {
      if (t.natural === "tree" && e.lat != null && e.lon != null) {
        trees.push(r1((e.lon - ORIGIN.lng) * M_LNG), r1(-(e.lat - ORIGIN.lat) * M_LAT));
      }
      continue;
    }
    const outer: Ring[] = [];
    const holes: Ring[] = [];
    if (e.type === "way") {
      if (!e.geometry) continue;
      outer.push(project(e.geometry));
    } else {
      for (const m of e.members ?? []) {
        if (m.type !== "way" || !m.geometry) continue;
        (m.role === "inner" ? holes : outer).push(project(m.geometry));
      }
    }
    if (!outer.length) continue;

    if (t.building || t["building:part"]) {
      for (const ring of outer) {
        if (ring.length < 6) continue;
        const [cx, cz] = centroid(ring);
        buildings.push({
          id: `${e.type[0]}${e.id}`,
          name: t.name ?? "",
          type: t.building ?? "part",
          part: !!t["building:part"],
          levels: num(t["building:levels"]),
          height: num(t.height),
          minHeight: num(t.min_height),
          roof: t["roof:shape"] ?? "",
          amenity: t.amenity ?? "",
          outer: ring,
          holes: e.type === "relation" ? holes : [],
          area: Math.round(area(ring)),
          center: [r1(cx), r1(cz)],
        });
      }
    } else if (t.highway) {
      if (["proposed", "construction", "abandoned", "elevator", "platform"].includes(t.highway)) continue;
      roads.push({
        kind: t.highway,
        name: t.name ?? "",
        sub: t.service ?? t.footway ?? "",
        lanes: num(t.lanes),
        line: outer[0],
      });
    } else {
      const kind = t.landuse ?? t.leisure ?? t.natural ?? (t.amenity === "parking" ? "parking" : undefined);
      if (!kind) continue;
      for (const ring of outer) if (ring.length >= 6) areas.push({ kind, name: t.name ?? "", ring, holes });
    }
  }

  // Tag every building with its housing community, if any.
  const claimable = new Set(["yes", "apartments", "dormitory", "residential", "university"]);
  for (const b of buildings) {
    for (const h of HOUSING) {
      const byName = !!b.name && h.match.test(b.name);
      const byNear =
        !b.name &&
        claimable.has(b.type) &&
        !!h.near?.some(([x, z, r]) => Math.hypot(b.center[0] - x, b.center[1] - z) < r);
      if (byName || byNear) {
        b.housing = h.name;
        b.housingKind = h.kind;
        break;
      }
    }
  }

  return {
    version: 1,
    origin: ORIGIN,
    attribution: "Map data © OpenStreetMap contributors, ODbL",
    housing: HOUSING.map(({ name, kind }) => ({ name, kind })),
    buildings,
    roads,
    areas,
    trees,
  };
}

/** Fetch UCR from Overpass, trying a mirror if the main server is busy. */
export async function downloadCampus(onStatus?: (s: string) => void): Promise<CampusData> {
  let lastErr: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      onStatus?.("Downloading UCR from OpenStreetMap...");
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(OVERPASS_QUERY),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      onStatus?.("Building the campus...");
      return osmToCampus(await res.json());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
