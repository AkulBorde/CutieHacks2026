// Owner: simulation
//
// Turns campus.json into a handful of merged three.js geometries, so the whole
// campus (thousands of buildings) draws in a few calls. Each building vertex
// carries a `bid` attribute (its index in data.buildings) for picking.
import * as THREE from "three";
import {
  type CampusArea,
  type CampusBuilding,
  type CampusRoad,
  type Ring,
  type Style,
  hash01,
  heightOf,
  styleOf,
} from "./campusData";

// ---------- small helpers ----------

export function signedArea(r: Ring): number {
  let s = 0;
  const n = r.length;
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n;
    s += r[i] * r[j + 1] - r[j] * r[i + 1];
  }
  return s / 2;
}

export function pointInRing(x: number, z: number, r: Ring): boolean {
  let inside = false;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], zi = r[i + 1], xj = r[j], zj = r[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function toVec2(r: Ring): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < r.length; i += 2) out.push(new THREE.Vector2(r[i], r[i + 1]));
  return out;
}

/** Triangulates a ring (+holes) into index triples over the flattened points. */
function triangulate(outer: Ring, holes: Ring[]) {
  const contour = toVec2(outer);
  const hs = holes.filter((h) => h.length >= 6).map(toVec2);
  const faces = THREE.ShapeUtils.triangulateShape(contour, hs);
  const pts = contour.concat(...hs);
  return { pts, faces };
}

class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  bid: number[] = [];

  vert(x: number, y: number, z: number, n: THREE.Vector3, u: number, v: number, c: THREE.Color, id: number) {
    this.pos.push(x, y, z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.bid.push(id);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("bid", new THREE.Float32BufferAttribute(this.bid, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

// ---------- colour palettes (Riverside: tan stucco, brick, terracotta) ----------

const WALLS: Record<Style, string[]> = {
  campus: ["#d9c4a1", "#e3d3b5", "#c7a983", "#ab6a4c", "#b9775a", "#ece5d8", "#c9c2b5", "#d6b48c"],
  housing: ["#eadcc2", "#e4cfae", "#d9bf98", "#f0e6d4", "#d7b08a"],
  house: ["#efe4cf", "#e9d8b8", "#f3eee4", "#e6c9a8", "#dcd2bd", "#f1dcc0", "#cfc4ae"],
  minor: ["#b9b3a8", "#a8a39a", "#c4bdb0"],
};
const ROOFS: Record<Style, string[]> = {
  campus: ["#b3aea4", "#c8c4bb", "#9f9a91", "#d6d2c9"],
  housing: ["#b4673f", "#a85d39", "#bf7651", "#9c5634"],
  house: ["#b0603b", "#9d5434", "#7a6a5a", "#8c7b69", "#c0714a"],
  minor: ["#8f8b84", "#9e9a92"],
};

function pick(list: string[], seed: string, salt: number): THREE.Color {
  const i = Math.floor(hash01(seed + salt) * list.length) % list.length;
  return new THREE.Color(list[i]);
}

// ---------- buildings ----------

export type BuildingGeometries = {
  walls: Record<Style, THREE.BufferGeometry>;
  roofs: Record<Style, THREE.BufferGeometry>;
};

function addWalls(gb: GeoBuilder, ring: Ring, isHole: boolean, base: number, top: number, c: THREE.Color, id: number) {
  const n = ring.length / 2;
  const ccw = signedArea(ring) > 0;
  // Outward from the building: right of travel for a CCW outer ring, left for
  // a CW one, and the reverse for courtyards (holes).
  const outwardRight = ccw !== isHole;
  let run = 0;
  const nrm = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cr = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = ring[i * 2], z0 = ring[i * 2 + 1], x1 = ring[j * 2], z1 = ring[j * 2 + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    if (outwardRight) nrm.set(dz / len, 0, -dx / len);
    else nrm.set(-dz / len, 0, dx / len);
    const u0 = run, u1 = run + len;
    run = u1;
    // Two triangles; flip winding so the face points along `nrm`.
    a.set(dx, 0, dz);
    b.set(dx, top - base, dz);
    cr.crossVectors(a, b);
    const quad: [number, number, number, number, number][] = [
      [x0, base, z0, u0, base], [x1, base, z1, u1, base], [x1, top, z1, u1, top], [x0, top, z0, u0, top],
    ];
    const order = cr.dot(nrm) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) {
      const q = quad[k];
      gb.vert(q[0], q[1], q[2], nrm, q[3], q[4], c, id);
    }
  }
}

function addFlatRoof(gb: GeoBuilder, outer: Ring, holes: Ring[], y: number, c: THREE.Color, id: number) {
  let tri;
  try {
    tri = triangulate(outer, holes);
  } catch {
    return;
  }
  const { pts, faces } = tri;
  for (const f of faces) {
    let [i0, i1, i2] = f;
    const p0 = pts[i0], p1 = pts[i1], p2 = pts[i2];
    // y of the 3D cross product; must be positive to face the sky.
    const cy = (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y);
    if (cy < 0) [i1, i2] = [i2, i1];
    for (const i of [i0, i1, i2]) gb.vert(pts[i].x, y, pts[i].y, UP, pts[i].x, pts[i].y, c, id);
  }
}

function addHipRoof(gb: GeoBuilder, ring: Ring, y: number, rise: number, c: THREE.Color, id: number) {
  const n = ring.length / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += ring[i * 2]; cz += ring[i * 2 + 1]; }
  cx /= n; cz /= n;
  const apex = new THREE.Vector3(cx, y + rise, cz);
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nr = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p0.set(ring[i * 2], y, ring[i * 2 + 1]);
    p1.set(ring[j * 2], y, ring[j * 2 + 1]);
    e1.subVectors(p1, p0);
    e2.subVectors(apex, p0);
    nr.crossVectors(e1, e2);
    let tri = [p0, p1, apex];
    if (nr.y < 0) { nr.negate(); tri = [p0, apex, p1]; }
    nr.normalize();
    for (const p of tri) gb.vert(p.x, p.y, p.z, nr, p.x, p.z, c, id);
  }
}

export function buildBuildings(buildings: CampusBuilding[], skip?: (b: CampusBuilding, i: number) => boolean): BuildingGeometries {
  const styles: Style[] = ["campus", "housing", "house", "minor"];
  const walls = Object.fromEntries(styles.map((s) => [s, new GeoBuilder()])) as Record<Style, GeoBuilder>;
  const roofs = Object.fromEntries(styles.map((s) => [s, new GeoBuilder()])) as Record<Style, GeoBuilder>;

  buildings.forEach((b, id) => {
    if (skip?.(b, id)) return;
    const style = styleOf(b);
    const top = heightOf(b);
    const base = Math.min(b.minHeight, top - 0.5);
    const wc = pick(WALLS[style], b.housing ?? b.id, 1);
    const rc = pick(ROOFS[style], b.housing ?? b.id, 2);
    // Small per-building brightness jitter so neighbours don't read as one slab.
    const j = 0.94 + hash01(b.id) * 0.1;
    wc.multiplyScalar(j);

    addWalls(walls[style], b.outer, false, base, top, wc, id);
    for (const h of b.holes) if (h.length >= 6) addWalls(walls[style], h, true, base, top, wc, id);

    const simple = b.holes.length === 0 && b.outer.length <= 16;
    if (style === "house" && simple && b.type !== "static_caravan") {
      addHipRoof(roofs[style], b.outer, top, Math.min(2.4, Math.sqrt(b.area) * 0.22), rc, id);
    } else if (style === "minor" && b.type === "carport") {
      addFlatRoof(roofs[style], b.outer, [], top, rc, id);
    } else {
      addFlatRoof(roofs[style], b.outer, b.holes, top, rc, id);
    }
  });

  return {
    walls: Object.fromEntries(styles.map((s) => [s, walls[s].build()])) as Record<Style, THREE.BufferGeometry>,
    roofs: Object.fromEntries(styles.map((s) => [s, roofs[s].build()])) as Record<Style, THREE.BufferGeometry>,
  };
}

/** One building's geometry on its own, for the selection highlight. */
export function buildSingle(b: CampusBuilding, inflate = 0.4): THREE.BufferGeometry {
  const gb = new GeoBuilder();
  const top = heightOf(b) + inflate;
  const c = new THREE.Color("#ffffff");
  addWalls(gb, b.outer, false, 0, top, c, 0);
  addFlatRoof(gb, b.outer, b.holes, top, c, 0);
  return gb.build();
}

// ---------- ground: lawns, parking, fields ----------

const AREA_STYLE: Record<string, { color: string; y: number } | undefined> = {
  grass: { color: "#7f9f55", y: 0.04 },
  park: { color: "#7a9c52", y: 0.035 },
  garden: { color: "#6f9550", y: 0.045 },
  recreation_ground: { color: "#86a45a", y: 0.035 },
  meadow: { color: "#a3a36a", y: 0.03 },
  grassland: { color: "#a3a36a", y: 0.03 },
  pitch: { color: "#5f9a48", y: 0.06 },
  track: { color: "#b4523e", y: 0.07 },
  stadium: { color: "#7c9b55", y: 0.05 },
  sports_centre: { color: "#9aa27a", y: 0.03 },
  swimming_pool: { color: "#4fb3d9", y: 0.08 },
  water: { color: "#5a9fc4", y: 0.05 },
  farmland: { color: "#a69a63", y: 0.02 },
  orchard: { color: "#8c9558", y: 0.02 },
  wood: { color: "#6b7f45", y: 0.03 },
  scrub: { color: "#9a9663", y: 0.025 },
  parking: { color: "#6b6b6b", y: 0.05 },
  construction: { color: "#b59f78", y: 0.025 },
};

export function buildAreas(areas: CampusArea[]): THREE.BufferGeometry {
  const gb = new GeoBuilder();
  for (const a of areas) {
    const s = AREA_STYLE[a.kind];
    if (!s || a.ring.length < 6) continue;
    const c = new THREE.Color(s.color).multiplyScalar(0.95 + hash01(a.ring.join()) * 0.08);
    addFlatRoof(gb, a.ring, a.holes, s.y, c, -1);
  }
  return gb.build();
}

// ---------- roads and walkways ----------

const ROAD_WIDTH: Record<string, number> = {
  motorway: 24, trunk: 18, primary: 15, secondary: 13, tertiary: 11,
  motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 7,
  residential: 9, unclassified: 8, living_street: 7, service: 5.5,
  footway: 3.2, pedestrian: 6, path: 2.4, cycleway: 2.6, steps: 2.6, track: 3, bridleway: 2.4,
};
const CAR = new Set(Object.keys(ROAD_WIDTH).filter((k) => !["footway", "pedestrian", "path", "cycleway", "steps", "track", "bridleway"].includes(k)));

export function isCarRoad(kind: string) {
  return CAR.has(kind);
}

function addRibbon(gb: GeoBuilder, line: Ring, width: number, y: number, c: THREE.Color) {
  const n = line.length / 2;
  if (n < 2) return;
  const hw = width / 2;
  const left: [number, number][] = [], right: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = line[i * 2], z = line[i * 2 + 1];
    const pi = Math.max(0, i - 1), ni = Math.min(n - 1, i + 1);
    let tx = line[ni * 2] - line[pi * 2], tz = line[ni * 2 + 1] - line[pi * 2 + 1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    // Miter: scale the offset by 1/cos(half-angle), clamped for sharp turns.
    let scale = 1;
    if (i > 0 && i < n - 1) {
      let ax = x - line[pi * 2], az = z - line[pi * 2 + 1];
      const al = Math.hypot(ax, az) || 1;
      ax /= al; az /= al;
      const dot = ax * tx + az * tz;
      scale = Math.min(2.5, 1 / Math.max(0.4, dot));
    }
    const ox = -tz * hw * scale, oz = tx * hw * scale;
    left.push([x + ox, z + oz]);
    right.push([x - ox, z - oz]);
  }
  let run = 0;
  for (let i = 0; i < n - 1; i++) {
    const seg = Math.hypot(line[i * 2 + 2] - line[i * 2], line[i * 2 + 3] - line[i * 2 + 1]);
    const v0 = run, v1 = run + seg;
    run = v1;
    const L0 = left[i], R0 = right[i], L1 = left[i + 1], R1 = right[i + 1];
    const tri = (p: [number, number], q: [number, number], r: [number, number], uv: number[]) => {
      const cy = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
      const pts = cy >= 0 ? [p, q, r] : [p, r, q];
      const uvs = cy >= 0 ? [0, 1, 2] : [0, 2, 1];
      pts.forEach((pt, k) => gb.vert(pt[0], y, pt[1], UP, uv[uvs[k] * 2], uv[uvs[k] * 2 + 1], c, -1));
    };
    tri(L0, R0, R1, [0, v0, 1, v0, 1, v1]);
    tri(L0, R1, L1, [0, v0, 1, v1, 0, v1]);
  }
}

export function buildRoads(roads: CampusRoad[]) {
  const car = new GeoBuilder();
  const walk = new GeoBuilder();
  const asphalt = new THREE.Color("#4b4e53");
  const concrete = new THREE.Color("#d9d2c3");
  for (const r of roads) {
    const w = ROAD_WIDTH[r.kind];
    if (!w) continue;
    if (CAR.has(r.kind)) {
      const width = r.lanes > 0 && r.kind !== "service" ? Math.max(w * 0.6, r.lanes * 3.4 + 1) : w;
      const y = 0.1 + (r.kind === "service" ? 0 : 0.01);
      addRibbon(car, r.line, r.sub === "parking_aisle" ? 6 : width, y, asphalt);
    } else {
      const c = r.kind === "track" ? new THREE.Color("#b9a582") : concrete;
      addRibbon(walk, r.line, w, 0.085, c);
    }
  }
  return { car: car.build(), walk: walk.build() };
}

// ---------- trees ----------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TreeSpot = { x: number; z: number; s: number; kind: "oak" | "citrus" | "palm" | "pine" };

/** Real tree nodes plus trees scattered through lawns, parks and the groves. */
export function scatterTrees(areas: CampusArea[], treeNodes: number[], buildings: CampusBuilding[], cap = 9000): TreeSpot[] {
  const rand = rng(1954); // UCR's founding year
  const out: TreeSpot[] = [];
  for (let i = 0; i < treeNodes.length; i += 2) out.push({ x: treeNodes[i], z: treeNodes[i + 1], s: 1, kind: "oak" });

  // Quick spatial grid of building footprints so trees never sit inside one.
  const cell = 40;
  const grid = new Map<string, CampusBuilding[]>();
  for (const b of buildings) {
    const k = `${Math.floor(b.center[0] / cell)},${Math.floor(b.center[1] / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(b);
  }
  const blocked = (x: number, z: number) => {
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (const b of grid.get(`${gx + dx},${gz + dz}`) ?? []) if (pointInRing(x, z, b.outer)) return true;
    return false;
  };

  for (const a of areas) {
    if (out.length >= cap) break;
    const r = a.ring;
    if (r.length < 6) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      minX = Math.min(minX, r[i]); maxX = Math.max(maxX, r[i]);
      minZ = Math.min(minZ, r[i + 1]); maxZ = Math.max(maxZ, r[i + 1]);
    }
    const ar = Math.abs(signedArea(r));
    if (a.kind === "orchard") {
      // Citrus groves are planted in rows, about 6 m apart.
      for (let x = minX; x <= maxX; x += 6.5)
        for (let z = minZ; z <= maxZ; z += 5.5)
          if (pointInRing(x, z, r) && out.length < cap) out.push({ x, z, s: 0.55 + rand() * 0.15, kind: "citrus" });
      continue;
    }
    const density =
      a.kind === "wood" ? 1 / 60 :
      a.kind === "park" || a.kind === "garden" ? 1 / 260 :
      a.kind === "grass" || a.kind === "recreation_ground" ? 1 / 420 :
      a.kind === "scrub" ? 1 / 300 : 0;
    if (!density) continue;
    const count = Math.min(600, Math.round(ar * density));
    for (let k = 0, tries = 0; k < count && tries < count * 4; tries++) {
      const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
      if (!pointInRing(x, z, r) || a.holes.some((h) => pointInRing(x, z, h)) || blocked(x, z)) continue;
      const roll = rand();
      out.push({
        x, z,
        s: 0.7 + rand() * 0.6,
        kind: a.kind === "scrub" ? "pine" : roll < 0.12 ? "palm" : roll < 0.22 ? "pine" : "oak",
      });
      k++;
    }
  }
  return out;
}
