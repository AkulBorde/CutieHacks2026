// Owner: simulation
//
// Builds the rooms of Aberdeen-Inverness, Lothian and Pentland Hills, floor
// by floor, from hallLayouts.ts: each wing gets a corridor down its middle
// with rooms on both sides (Pentland: suites of four doubles, two toilets,
// two showers and a living room), and the community maps' lounges, stairs,
// elevators and ground-floor common rooms where the maps put them. Rooms are
// numbered per wing letter in walking order (down one side, back the other),
// like real hallways, and labelled e.g. "A" + floor + "07".
import type { CampusBuilding } from "./campusData";
import type { Cell, CellKind } from "./floorPlan";
import type { HallLayout, Slot, WingSpec } from "./hallLayouts";
import { pointInRing } from "./buildGeometry";

type P = [number, number];
type Quad = P[];

/** Separating-axis test for two convex quads (touching edges don't count). */
function overlaps(a: Quad, b: Quad): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1], nz = p[0] - q[0];
      const len = Math.hypot(nx, nz) || 1;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of a) { const d = (v[0] * nx + v[1] * nz) / len; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const v of b) { const d = (v[0] * nx + v[1] * nz) / len; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax <= bMin + 0.15 || bMax <= aMin + 0.15) return false;
    }
  }
  return true;
}

/** [s0, s1] minus the blocked intervals, as pieces at least `min` long. */
function freeParts(s0: number, s1: number, blocked: [number, number][], min = 0.8): [number, number][] {
  let parts: [number, number][] = [[s0, s1]];
  for (const [b0, b1] of blocked) {
    const next: [number, number][] = [];
    for (const [p0, p1] of parts) {
      if (b1 <= p0 || b0 >= p1) next.push([p0, p1]);
      else {
        if (b0 > p0) next.push([p0, b0]);
        if (b1 < p1) next.push([b1, p1]);
      }
    }
    parts = next;
  }
  return parts.filter(([p0, p1]) => p1 - p0 >= min);
}

type Draft = { q: Quad; kind: CellKind; label: string; wing?: string; angle: number; order: number };

export function hallFloorCells(b: CampusBuilding, lay: HallLayout, floor: number): Cell[] {
  const holes = b.holes.filter((h) => h.length >= 6);
  const inside = (x: number, z: number) => pointInRing(x, z, b.outer) && !holes.some((h) => pointInRing(x, z, h));
  const out: Draft[] = [];
  const center = (q: Quad): P => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length];
  const fits = (q: Quad) => {
    const [cx, cz] = center(q);
    if (!inside(cx, cz)) return false;
    // Corners pulled 10% toward the middle must be inside the building.
    if (!q.every(([x, z]) => inside(x + (cx - x) * 0.1, z + (cz - z) * 0.1))) return false;
    return !out.some((d) => overlaps(d.q, q));
  };
  const lerp = (p: P, q: P, k: number): P => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  const add = (d: Draft) => {
    if (fits(d.q)) {
      out.push(d);
      return;
    }
    if (d.order < 0) return;
    // At slanted wing ends a full room pokes through the wall: shorten it
    // (from either end) until it fits.
    const [q0, q1, q2, q3] = d.q;
    for (const k of [0.85, 0.7, 0.55]) {
      for (const q of [[q0, lerp(q0, q1, k), lerp(q3, q2, k), q3], [lerp(q1, q0, k), q1, q2, lerp(q2, q3, k)]] as Quad[]) {
        if (fits(q)) {
          out.push({ ...d, q });
          return;
        }
      }
    }
  };

  // Lobbies, hubs and offices outside the wings.
  for (const a of lay.areas) {
    if (a.floor && a.floor !== floor) continue;
    const q = a.corners as Quad;
    const [x0, z0] = q[0], [x1, z1] = q[1];
    add({ q, kind: a.kind, label: a.label, angle: Math.atan2(z1 - z0, x1 - x0), order: -1 });
  }

  lay.wings.forEach((w, wi) => wingCells(w, wi, floor, add));

  // Number rooms per wing letter in walking order.
  out.sort((p, q) => p.order - q.order);
  const perLetter = new Map<string, number>();
  return out.map((d) => {
    let label = d.label;
    if (d.kind === "room") {
      const k = d.wing ?? "";
      const n = (perLetter.get(k) ?? 0) + 1;
      perLetter.set(k, n);
      label = String(n % 100).padStart(2, "0");
    }
    return { corners: d.q, center: center(d.q), kind: d.kind, label, angle: d.angle, wing: d.wing };
  });
}

function wingCells(w: WingSpec, wi: number, floor: number, add: (d: Draft) => void) {
  const [ax, az] = w.a, [bx, bz] = w.b;
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 2) return;
  const tx = (bx - ax) / L, tz = (bz - az) / L;
  const nx = -tz, nz = tx; // "L" side of a -> b
  const hh = w.hall / 2;
  const angle = Math.atan2(tz, tx);
  // Half the wall-to-wall width at s (wings can taper a little).
  const halfAt = (s: number) => (w.w + (w.w2 - w.w) * (s / L)) / 2;
  // A point s along the wing, `off` across it; |off| = OUTER means on the wall.
  const OUTER = 1e6;
  const at = (s: number, off: number): P => {
    const o = Math.abs(off) >= OUTER ? Math.sign(off) * halfAt(s) : Math.abs(off) >= OUTER / 2 ? Math.sign(off) * (halfAt(s) - (OUTER - Math.abs(off))) : off;
    return [ax + tx * s + nx * o, az + tz * s + nz * o];
  };
  const half = OUTER;
  // Floor-specific slots first, so the ground floor's common rooms win.
  const slots = w.slots.filter((s) => !s[5] || s[5] === floor).sort((p, q) => (q[5] ? 1 : 0) - (p[5] ? 1 : 0));
  const blocked: Record<"L" | "R", [number, number][]> = { L: [], R: [] };
  // Walking order: side L from a to b, then side R back from b to a.
  const ord = (side: "L" | "R" | "F", s: number) => wi * 1e6 + (side === "R" ? 5e5 + (L - s) * 100 : s * 100);

  const sideQuad = (side: "L" | "R", s0: number, s1: number, inner: number, outer: number): Quad => {
    const g = side === "L" ? 1 : -1;
    // Wall-side edge first, then the hallway side.
    return [at(s0, g * outer), at(s1, g * outer), at(s1, g * inner), at(s0, g * inner)];
  };

  for (const s of slots as Slot[]) {
    const [f0, f1, side, kind, label] = s;
    const s0 = f0 * L, s1 = f1 * L;
    if (side === "F") {
      for (const [p0, p1] of freeParts(s0, s1, blocked.L)) {
        for (const [r0, r1] of freeParts(p0, p1, blocked.R)) {
          add({ q: [at(r0, half), at(r1, half), at(r1, -half), at(r0, -half)], kind, label, wing: w.letter, angle, order: ord("F", r0) });
          blocked.L.push([r0, r1]);
          blocked.R.push([r0, r1]);
        }
      }
    } else {
      for (const [p0, p1] of freeParts(s0, s1, blocked[side])) {
        add({ q: sideQuad(side, p0, p1, hh, half), kind, label, wing: w.letter, angle, order: ord(side, p0) });
        blocked[side].push([p0, p1]);
      }
    }
  }
  if (w.style === "none") return;

  const rooms = (side: "L" | "R", p0: number, p1: number, inner: number, outer: number) => {
    const len = p1 - p0;
    if (len < w.roomW * 0.6) return;
    const k = Math.max(1, Math.round(len / w.roomW));
    const step = len / k;
    for (let i = 0; i < k; i++) {
      const r0 = p0 + i * step, r1 = r0 + step;
      add({ q: sideQuad(side, r0, r1, inner, outer), kind: "room", label: "", wing: w.letter, angle, order: ord(side, r0) });
    }
  };

  for (const side of ["L", "R"] as const) {
    for (const [p0, p1] of freeParts(0, L, blocked[side])) {
      if (w.style === "double") {
        rooms(side, p0, p1, hh, half);
        continue;
      }
      // Pentland suites: four doubles along the outside wall; living room,
      // two toilets and two showers on the hallway side.
      const ext = Math.min(4.2, (Math.min(w.w, w.w2) / 2 - hh) * 0.58);
      const mid = OUTER - ext; // "ext metres in from the wall"
      const span = 4 * w.roomW;
      let s = p0;
      if (Math.min(w.w, w.w2) / 2 - ext - hh < 2) {
        rooms(side, p0, p1, hh, half);
        continue;
      }
      while (s + span <= p1 + 0.01) {
        rooms(side, s, s + span, mid, half);
        const lv = 2 * w.roomW;
        add({ q: sideQuad(side, s, s + lv, hh, mid), kind: "lounge", label: "Suite Living Room", wing: w.letter, angle, order: ord(side, s + 0.01) });
        const unit = (span - lv) / 4;
        ["Toilet", "Shower", "Toilet", "Shower"].forEach((lb, i) => {
          const u0 = s + lv + i * unit;
          add({ q: sideQuad(side, u0, u0 + unit, hh, mid), kind: "bath", label: lb, wing: w.letter, angle, order: ord(side, u0 + 0.01) });
        });
        s += span;
      }
      if (p1 - s >= w.roomW * 0.6) rooms(side, s, p1, hh, half);
    }
  }
}
