"use client";

// Owner: simulation
//
// Trees: real OSM tree nodes, lawns and groves, plus street trees along every
// walkway and residential street, palms lining the big avenues (this is
// Riverside), shade trees across campus and in every back yard.
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CampusBuilding, CampusData } from "./campusData";
import { nearCampus, styleOf } from "./campusData";
import { pointInRing, scatterTrees, type TreeSpot } from "./buildGeometry";

// ---------- placement ----------

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

const ROAD_HALF: Record<string, number> = {
  motorway: 12, trunk: 9, primary: 7.5, secondary: 6.5, tertiary: 5.5,
  residential: 4.5, unclassified: 4, service: 2.8, living_street: 3.5,
  motorway_link: 4, primary_link: 4, secondary_link: 3.5, tertiary_link: 3.5,
};

/** Coarse occupancy grid of buildings and car roads, so trees avoid both. */
class Blocker {
  cell = 3;
  roads = new Set<number>();
  grid = new Map<number, CampusBuilding[]>();
  key(x: number, z: number) {
    return (Math.floor(x / this.cell) + 4000) * 10000 + (Math.floor(z / this.cell) + 4000);
  }
  constructor(data: CampusData) {
    for (const r of data.roads) {
      const hw = ROAD_HALF[r.kind];
      if (!hw) continue;
      const L = r.line;
      for (let i = 0; i + 3 < L.length; i += 2) {
        const dx = L[i + 2] - L[i], dz = L[i + 3] - L[i + 1];
        const len = Math.hypot(dx, dz);
        for (let s = 0; s <= len; s += 1.5) {
          const x = L[i] + (dx * s) / len, z = L[i + 1] + (dz * s) / len;
          for (let ox = -hw; ox <= hw; ox += this.cell) for (let oz = -hw; oz <= hw; oz += this.cell) this.roads.add(this.key(x + ox, z + oz));
        }
      }
    }
    const big = 40;
    for (const b of data.buildings) {
      const k = Math.floor(b.center[0] / big) * 100000 + Math.floor(b.center[1] / big);
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(b);
    }
  }
  free(x: number, z: number, pad = 0) {
    if (this.roads.has(this.key(x, z))) return false;
    const big = 40;
    const gx = Math.floor(x / big), gz = Math.floor(z / big);
    for (let a = -2; a <= 2; a++)
      for (let c = -2; c <= 2; c++)
        for (const b of this.grid.get((gx + a) * 100000 + gz + c) ?? []) {
          if (pointInRing(x, z, b.outer)) return false;
          if (pad && (pointInRing(x + pad, z, b.outer) || pointInRing(x - pad, z, b.outer) || pointInRing(x, z + pad, b.outer) || pointInRing(x, z - pad, b.outer))) return false;
        }
    return true;
  }
}

export function placeTrees(data: CampusData): TreeSpot[] {
  const rand = rng(92521); // UCR's ZIP code
  const block = new Blocker(data);
  const out: TreeSpot[] = scatterTrees(data.areas, data.trees, data.buildings, 6000);
  const add = (x: number, z: number, kind: TreeSpot["kind"], s: number, pad = 2) => {
    if (block.free(x, z, pad)) out.push({ x, z, kind, s });
  };

  for (const r of data.roads) {
    const L = r.line;
    const avenue = ["primary", "secondary", "trunk"].includes(r.kind);
    const street = ["residential", "tertiary", "unclassified", "living_street"].includes(r.kind);
    const walk = r.kind === "footway" && r.sub !== "crossing" && r.sub !== "sidewalk";
    if (!avenue && !street && !walk) continue;
    const spacing = avenue ? 17 : street ? 13 : 16;
    const off = avenue ? (ROAD_HALF[r.kind] ?? 7) + 3 : street ? (ROAD_HALF[r.kind] ?? 4.5) + 2.6 : 3.2;
    const p = avenue ? 0.9 : street ? 0.7 : 0.6;
    let carry = rand() * spacing;
    for (let i = 0; i + 3 < L.length; i += 2) {
      const dx = L[i + 2] - L[i], dz = L[i + 3] - L[i + 1];
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      const nx = -dz / len, nz = dx / len;
      let s = carry;
      for (; s < len; s += spacing) {
        const x = L[i] + (dx * s) / len, z = L[i + 1] + (dz * s) / len;
        for (const side of walk ? [s % (2 * spacing) < spacing ? 1 : -1] : [1, -1]) {
          if (rand() > p) continue;
          const kind: TreeSpot["kind"] = avenue ? (rand() < 0.85 ? "palm" : "oak") : walk ? (rand() < 0.15 ? "pine" : "oak") : rand() < 0.1 ? "palm" : "oak";
          add(x + nx * off * side, z + nz * off * side, kind, avenue ? 1 + rand() * 0.25 : 0.75 + rand() * 0.5);
        }
      }
      carry = s - len;
    }
  }

  // Campus shade trees and yard trees.
  for (const b of data.buildings) {
    const st = styleOf(b);
    if (st === "house") {
      const n = rand() < 0.7 ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(b.area) * 0.6 + 4 + rand() * 4;
        add(b.center[0] + Math.cos(a) * d, b.center[1] + Math.sin(a) * d, rand() < 0.12 ? "palm" : rand() < 0.2 ? "pine" : "oak", 0.65 + rand() * 0.5, 1.5);
      }
    } else if (st !== "minor") {
      const n = Math.min(14, Math.round(b.area / 450) + 2);
      const R = Math.sqrt(b.area) * 0.75 + 16;
      for (let k = 0; k < n; k++) {
        const a = rand() * Math.PI * 2, d = R * (0.7 + rand() * 0.7);
        add(b.center[0] + Math.cos(a) * d, b.center[1] + Math.sin(a) * d, rand() < 0.1 ? "palm" : rand() < 0.15 ? "pine" : "oak", 0.9 + rand() * 0.6, 3);
      }
    }
  }
  // Nothing grows outside UCR: the map is blank past the campus edge.
  return out.filter((t) => nearCampus(t.x, t.z)).slice(0, 32000);
}

// ---------- models ----------

function lumpy(g: THREE.BufferGeometry, amt: number, seed: number) {
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const r = rng(seed);
  const map = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let f = map.get(k);
    if (f === undefined) map.set(k, (f = 1 + (r() - 0.5) * amt));
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

function oakCanopy() {
  const a = lumpy(new THREE.IcosahedronGeometry(3.2, 1), 0.35, 1).translate(0, 5.6, 0);
  const b = lumpy(new THREE.IcosahedronGeometry(2.4, 1), 0.35, 2).translate(1.9, 4.9, 0.7);
  const c = lumpy(new THREE.IcosahedronGeometry(2.2, 1), 0.35, 3).translate(-1.6, 5.0, -1.1);
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed(), c.toNonIndexed()]);
}
function pineCanopy() {
  // Italian cypress / pine silhouette, common on California campuses.
  return lumpy(new THREE.ConeGeometry(1.9, 10, 8, 3), 0.18, 4).translate(0, 7, 0).toNonIndexed();
}
function citrusCanopy() {
  return lumpy(new THREE.IcosahedronGeometry(1.9, 1), 0.25, 5).translate(0, 2.2, 0).toNonIndexed();
}
function palmCanopy() {
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.BoxGeometry(0.9, 0.08, 4.6);
    f.translate(0, 0, 2.3);
    f.rotateX(0.55 + (i % 3) * 0.12);
    f.rotateY((i / 9) * Math.PI * 2);
    fronds.push(f.toNonIndexed());
  }
  const head = new THREE.IcosahedronGeometry(0.8, 0).toNonIndexed();
  return mergeGeometries([...fronds, head]).translate(0, 12.2, 0);
}

const SPECIES = {
  oak: { canopy: oakCanopy, trunkH: 4, trunkR: 1, color: "#6f9447" },
  pine: { canopy: pineCanopy, trunkH: 2.5, trunkR: 0.8, color: "#4f7040" },
  citrus: { canopy: citrusCanopy, trunkH: 1.2, trunkR: 0.6, color: "#5a8a3a" },
  palm: { canopy: palmCanopy, trunkH: 12.4, trunkR: 0.9, color: "#7d9a46" },
} as const;
type Kind = keyof typeof SPECIES;

export default function Vegetation({ data }: { data: CampusData }) {
  const spots = useMemo(() => placeTrees(data), [data]);
  const byKind = useMemo(() => {
    const m: Record<Kind, TreeSpot[]> = { oak: [], pine: [], citrus: [], palm: [] };
    for (const t of spots) m[t.kind as Kind].push(t);
    return m;
  }, [spots]);
  return (
    <group>
      <Trunks spots={spots} />
      {(Object.keys(SPECIES) as Kind[]).map((k) => (
        <Canopies key={k} kind={k} spots={byKind[k]} />
      ))}
    </group>
  );
}

function Trunks({ spots }: { spots: TreeSpot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.CylinderGeometry(0.2, 0.34, 1, 6).translate(0, 0.5, 0), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6e5a46", roughness: 1 }), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    spots.forEach((t, i) => {
      const sp = SPECIES[t.kind as Kind];
      o.position.set(t.x, 0, t.z);
      o.scale.set(t.s * sp.trunkR, sp.trunkH * t.s, t.s * sp.trunkR);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);
  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, spots.length)]} castShadow frustumCulled={false} />;
}

function Canopies({ kind, spots }: { kind: Kind; spots: TreeSpot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const sp = SPECIES[kind];
  const geo = useMemo(() => sp.canopy(), [sp]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: true }), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const base = new THREE.Color(sp.color);
    const c = new THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    spots.forEach((t, i) => {
      o.position.set(t.x, 0, t.z);
      o.scale.setScalar(t.s);
      o.rotation.set(0, ((t.x * 13.7 + t.z * 7.3) % 6.283) || 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      const j = Math.sin(t.x * 0.37 + t.z * 0.71);
      c.setHSL(hsl.h + j * 0.035, hsl.s * (0.85 + 0.25 * Math.cos(t.z * 0.5)), hsl.l * (0.88 + 0.22 * j));
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots, sp]);
  if (!spots.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} castShadow receiveShadow frustumCulled={false} />;
}
