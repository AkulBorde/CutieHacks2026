// Owner: simulation
//
// Generates a floor plan for any building footprint. Rooms are laid along
// every exterior wall (and courtyard wall), facing a hallway down the middle
// of each wing, so they always line up with the building no matter how the
// wings are angled. That is how double-loaded residence halls are built.
//
// Per-hall layouts use what UCR publishes about each hall (UCR does not
// publish full floor plans):
//  - Aberdeen-Inverness: double rooms of about 12 ft by 12 ft on shared
//    hallways (Housing Services; PCAD).
//  - Pentland Hills: suites of four double rooms with two toilet rooms, two
//    shower rooms and a living room (housing.ucr.edu).
//  - Dundee: two L-shaped seven-storey buildings (Dundee project page).
// A student's room code ("A348", "301") maps to a stable room on a real floor.
import { type CampusBuilding, FLOOR_HEIGHT, heightOf } from "./campusData";
import { pointInRing, signedArea } from "./buildGeometry";
import { type HallMap, type RealPlan, PENTLAND_LETTERS, applyAffine, hallMapFor, realPlansFor } from "./realPlans";

export type CellKind = "room" | "bath" | "stairs" | "lounge" | "elevator";

export type Cell = {
  /** Corners in scene x,z: wall-side edge first, then the hallway side. */
  corners: [number, number][];
  center: [number, number];
  kind: CellKind;
  /** Two-digit room number for rooms; a short name for other cells. */
  label: string;
  /** Direction of the wall the room sits on (radians), for text. */
  angle: number;
  /** Wing letter from the hall's community map (A-I: A-E, Lothian: A-G, ...). */
  wing?: string;
};

export type FloorPlan = {
  floors: number;
  xMin: number; xMax: number; zMin: number; zMax: number;
  outer: number[];
  holes: number[][];
  cells: Cell[];
  wing: string;
  /** Floors that have a real published floor plan, and the rooms detected on it. */
  real: Map<number, { plan: RealPlan; cells: Cell[] }>;
  /** The hall's community map (ground floor), fitted to this footprint. */
  hallMap: HallMap | null;
  /** Pentland Hills building letter(s) from the community map, e.g. "K" or "B/C". */
  letter: string | null;
};

type Profile = {
  roomW: number; // along the wall
  roomD: number; // wall to hallway
  hall: number; // hallway width
  /** Slot pattern along each wall, repeated. */
  pattern: CellKind[];
};

const FT = 0.3048;
const PROFILES: Record<string, Profile> = {
  // 12 ft x 12 ft doubles on a shared hallway, a bathroom block every so often.
  "Aberdeen-Inverness": { roomW: 12 * FT, roomD: 12 * FT, hall: 2.2, pattern: ["room", "room", "room", "room", "room", "room", "room", "room", "room", "bath"] },
  // Suites: four doubles + bathroom core (2 toilets, 2 showers) + living room.
  "Pentland Hills": { roomW: 3.5, roomD: 4.2, hall: 2.0, pattern: ["room", "room", "bath", "lounge", "room", "room"] },
  Dundee: { roomW: 3.6, roomD: 4.6, hall: 2.2, pattern: ["room", "room", "room", "room", "room", "room", "room", "room", "room", "room", "bath"] },
  Lothian: { roomW: 3.7, roomD: 4.3, hall: 2.2, pattern: ["room", "room", "room", "room", "room", "room", "room", "room", "bath"] },
};
const DEFAULT: Profile = { roomW: 3.9, roomD: 4.8, hall: 2.4, pattern: ["room", "room", "room", "room", "room", "room", "room", "room", "room", "room", "room", "bath"] };

export function floorsOf(b: CampusBuilding) {
  return Math.max(1, Math.round((heightOf(b) - 0.8) / FLOOR_HEIGHT));
}

/** Floor number from a room code like "A348" or "301" (first digit). */
export function parseRoom(room?: string): { floor: number; num: number; wing: string } | null {
  if (!room) return null;
  const m = /^([A-Za-z]*)(\d)(\d+)$/.exec(room.trim());
  if (!m) return null;
  return { wing: m[1].toUpperCase(), floor: Number(m[2]), num: Number(m[3]) };
}

// ---------- geometry helpers ----------

/** Distance from p along unit dir d to the nearest wall of the footprint. */
function rayToWall(px: number, pz: number, dx: number, dz: number, rings: number[][]): number {
  let best = Infinity;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
      const ex = bx - ax, ez = bz - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - px) * ez - (az - pz) * ex) / den;
      const u = ((ax - px) * dz - (az - pz) * dx) / den;
      if (t > 0.05 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
  }
  return best;
}

type Quad = [number, number][];

/** Separating-axis test for two convex quads. */
function overlaps(a: Quad, b: Quad): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i], q = poly[(i + 1) % 4];
      const nx = q[1] - p[1], nz = p[0] - q[0];
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of a) { const d = v[0] * nx + v[1] * nz; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const v of b) { const d = v[0] * nx + v[1] * nz; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      const len = Math.hypot(nx, nz) || 1;
      if (aMax <= bMin + 0.05 * len || bMax <= aMin + 0.05 * len) return false;
    }
  }
  return true;
}

// ---------- the plan ----------

export function planBuilding(b: CampusBuilding, wingHint = ""): FloorPlan {
  const prof = (b.housing && PROFILES[b.housing]) || DEFAULT;
  const holes = b.holes.filter((h) => h.length >= 6);
  const rings = [b.outer, ...holes];
  const inside = (x: number, z: number) => pointInRing(x, z, b.outer) && !holes.some((h) => pointInRing(x, z, h));

  type Edge = { ax: number; az: number; tx: number; tz: number; nx: number; nz: number; len: number; ring: number; idx: number };
  const edges: Edge[] = [];
  rings.forEach((r, ri) => {
    const n = r.length / 2;
    const sign = signedArea(r) > 0 ? 1 : -1;
    const toInterior = ri === 0 ? 1 : -1; // courtyard walls face out of the hole
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = r[i * 2], az = r[i * 2 + 1];
      const ex = r[j * 2] - ax, ez = r[j * 2 + 1] - az;
      const len = Math.hypot(ex, ez);
      if (len < 2.5) continue;
      const tx = ex / len, tz = ez / len;
      // Left of travel is inside a CCW ring.
      const nx = -tz * sign * toInterior, nz = tx * sign * toInterior;
      edges.push({ ax, az, tx, tz, nx, nz, len, ring: ri, idx: i });
    }
  });

  // Long walls first, so the main hallways get their rooms before corners.
  const order = [...edges].sort((a, b2) => b2.len - a.len);
  const placed: { q: Quad; cell: Cell; key: [number, number, number] }[] = [];
  for (const e of order) {
    if (e.len < prof.roomW * 0.8) continue;
    // How deep can rooms be here? Look across the wing to the opposite wall.
    const mx = e.ax + e.tx * e.len * 0.5 + e.nx * 0.1, mz = e.az + e.tz * e.len * 0.5 + e.nz * 0.1;
    const across = rayToWall(mx, mz, e.nx, e.nz, rings);
    if (!Number.isFinite(across) || across < 3) continue;
    let depth = prof.roomD;
    if (across < prof.roomD * 2 + prof.hall) {
      // Narrow wing: split what's there between two rows and the hallway,
      // or a single row if it's too narrow for two.
      depth = across >= 2 * 2.8 + 1.4 ? (across - prof.hall) / 2 : Math.min(prof.roomD, across - 1.4);
    }
    if (depth < 2.4) continue;
    const n = Math.max(1, Math.round(e.len / prof.roomW));
    const w = e.len / n;
    for (let k = 0; k < n; k++) {
      const s0 = k * w + 0.04, s1 = (k + 1) * w - 0.04;
      const a: [number, number] = [e.ax + e.tx * s0, e.az + e.tz * s0];
      const b2: [number, number] = [e.ax + e.tx * s1, e.az + e.tz * s1];
      const q: Quad = [a, b2, [b2[0] + e.nx * depth, b2[1] + e.nz * depth], [a[0] + e.nx * depth, a[1] + e.nz * depth]];
      const cx = (q[0][0] + q[2][0]) / 2, cz = (q[0][1] + q[2][1]) / 2;
      // Every corner (pulled slightly inward) must be inside the building.
      const ok = inside(cx, cz) && q.every(([x, z]) => inside(x + (cx - x) * 0.08, z + (cz - z) * 0.08));
      if (!ok || placed.some((p) => overlaps(p.q, q))) continue;
      const kind = n >= 6 && (k === 0 || k === n - 1) && e.len > 30 ? "stairs" : prof.pattern[k % prof.pattern.length];
      placed.push({
        q,
        key: [e.ring, e.idx, k],
        cell: { corners: q, center: [cx, cz], kind, label: "", angle: Math.atan2(e.tz, e.tx) },
      });
    }
  }

  // Wing letters from the community map: each room takes the nearest wing
  // label (Pentland Hills buildings take their own letter).
  const hallMap = hallMapFor(b.housing, b.id);
  const letter = b.housing === "Pentland Hills" ? PENTLAND_LETTERS[b.id] ?? null : null;
  let anchors = (hallMap?.anchors ?? []).map(([l, px, py]) => ({ l, p: applyAffine(hallMap!.affine, px, py) }));
  if (letter) anchors = anchors.filter((a) => letter.split("/").includes(a.l));
  const wingOf = (x: number, z: number) => {
    let best = "", bd = Infinity;
    for (const a of anchors) {
      const d = Math.hypot(a.p[0] - x, a.p[1] - z);
      if (d < bd) { bd = d; best = a.l; }
    }
    return best;
  };

  // Number rooms in walking order around the building, like a real hallway,
  // restarting in each wing.
  placed.sort((p, q) => p.key[0] - q.key[0] || p.key[1] - q.key[1] || p.key[2] - q.key[2]);
  const perWing = new Map<string, number>();
  const cells = placed.map((p) => {
    const c = p.cell;
    c.wing = anchors.length ? wingOf(c.center[0], c.center[1]) : undefined;
    if (c.kind === "room") {
      const k = c.wing ?? "";
      const n = perWing.get(k) ?? 0;
      perWing.set(k, n + 1);
      c.label = String(10 + (n % 90)).padStart(2, "0");
    } else c.label = c.kind === "bath" ? "WC / Shower" : c.kind === "stairs" ? "Stairs" : "Lounge";
    return c;
  });

  // Tiny or odd footprints: one big room.
  if (!cells.some((c) => c.kind === "room")) {
    const [cx, cz] = b.center;
    const s = Math.max(2, Math.sqrt(b.area) * 0.3);
    cells.push({ corners: [[cx - s, cz - s], [cx + s, cz - s], [cx + s, cz + s], [cx - s, cz + s]], center: [cx, cz], kind: "room", label: "10", angle: 0 });
  }

  let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < b.outer.length; i += 2) {
    xMin = Math.min(xMin, b.outer[i]); xMax = Math.max(xMax, b.outer[i]);
    zMin = Math.min(zMin, b.outer[i + 1]); zMax = Math.max(zMax, b.outer[i + 1]);
  }
  const wing = wingHint || (b.name.match(/\b([A-Z])$/)?.[1] ?? "");
  const real = new Map<number, { plan: RealPlan; cells: Cell[] }>();
  for (const [f, rp] of realPlansFor(b.name)) real.set(f, { plan: rp, cells: realCells(rp, xMin, xMax, zMin, zMax) });
  const floors = Math.max(floorsOf(b), ...real.keys());
  return { floors, xMin, xMax, zMin, zMax, outer: b.outer, holes, cells, wing, real, hallMap, letter };
}

/** Map pixel -> scene: the plan's wall box onto the footprint's bounding box. */
export function realToScene(rp: RealPlan, xMin: number, xMax: number, zMin: number, zMax: number) {
  const [x0, y0, x1, y1] = rp.bbox;
  const sx = (xMax - xMin) / (x1 - x0), sz = (zMax - zMin) / (y1 - y0);
  return (px: number, py: number): [number, number] => [xMin + (px - x0) * sx, zMin + (py - y0) * sz];
}

function realCells(rp: RealPlan, xMin: number, xMax: number, zMin: number, zMax: number): Cell[] {
  const P = realToScene(rp, xMin, xMax, zMin, zMax);
  const out: Cell[] = [];
  let n = 0;
  for (const [x0, y0, x1, y1, kind, label] of rp.rooms) {
    const a = P(x0, y0), b = P(x1, y1);
    const w = b[0] - a[0], d = b[1] - a[1];
    if (w < 1 || d < 1) continue;
    // Small rooms are closets and offices too tight to be "a room" for placing people.
    const k: CellKind = kind === "e" ? "elevator" : "room";
    out.push({
      corners: [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]],
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      kind: k,
      label: kind === "c" ? label : k === "room" ? (w * d >= 12 ? String(10 + n++).padStart(2, "0") : "") : label,
      angle: 0,
    });
  }
  return out;
}

/** The cells to show on a floor: the real plan's rooms if there is one. */
export function cellsOn(plan: FloorPlan, floor: number): Cell[] {
  return plan.real.get(floor)?.cells ?? plan.cells;
}

/** Room label on a given floor: wing + floor + two-digit number. */
export function roomLabel(plan: FloorPlan, cell: Cell, floor: number) {
  return cell.kind === "room" ? `${cell.wing ?? plan.wing}${floor}${cell.label}` : cell.label;
}

/** Does this building contain the given wing (per the hall's community map)? */
export function buildingHasWing(b: CampusBuilding, wing: string): boolean {
  if (b.housing === "Pentland Hills") return (PENTLAND_LETTERS[b.id] ?? "").split("/").includes(wing);
  const m = hallMapFor(b.housing, b.id);
  return !!m && m.anchors.some(([l]) => l === wing);
}

/** The cell a student's room code lands in. Stable for the same code. */
export function cellForRoom(plan: FloorPlan, room?: string): { cell: Cell; floor: number } {
  const p = parseRoom(room);
  const floor = Math.min(plan.floors, Math.max(1, p?.floor ?? 1));
  // A classroom number printed on a real map wins outright.
  for (const [f, r] of plan.real) {
    const hit = room && r.cells.find((c) => c.label.split(" · ").includes(room));
    if (hit) return { cell: hit, floor: f };
  }
  let rooms = cellsOn(plan, floor).filter((c) => c.kind === "room" && c.label !== "");
  if (!rooms.length) rooms = plan.cells.filter((c) => c.kind === "room");
  // Stay inside the student's wing (e.g. D210 -> wing D) when the map has it.
  const inWing = p?.wing ? rooms.filter((c) => c.wing === p.wing) : [];
  if (inWing.length) rooms = inWing;
  let idx = 0;
  if (p) {
    const direct = rooms.findIndex((c) => Number(c.label) === p.num);
    idx = direct >= 0 ? direct : p.num % rooms.length;
  }
  return { cell: rooms[idx], floor };
}

export const floorY = (floor: number) => (floor - 1) * FLOOR_HEIGHT;
