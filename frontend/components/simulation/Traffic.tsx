"use client";

// Owner: simulation
//
// Cars: parked along every parking aisle and in every lot, and live traffic
// driving the real streets around campus.
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CampusData, Ring } from "./campusData";
import { pointInRing, signedArea } from "./buildGeometry";

const PAINT = ["#f2f2f0", "#f2f2f0", "#1d1f22", "#1d1f22", "#9ea3a8", "#9ea3a8", "#6c7176", "#8e1b1b", "#1f3d6b", "#2e5f8a", "#c9c2b2", "#3d4a3a", "#b5651d"];

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

/** A sedan facing +x: painted body, darker glass cabin, black tyres. */
function carGeometry() {
  const paint = (g: THREE.BufferGeometry, v: number) => {
    const n = g.getAttribute("position").count;
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(n * 3).fill(v), 3));
    return g;
  };
  const body = paint(new THREE.BoxGeometry(4.5, 0.8, 1.8).translate(0, 0.65, 0).toNonIndexed(), 1);
  const hood = paint(new THREE.BoxGeometry(4.3, 0.12, 1.76).translate(0, 1.1, 0).toNonIndexed(), 1);
  const cabin = paint(new THREE.BoxGeometry(2.4, 0.62, 1.62).translate(-0.25, 1.45, 0).toNonIndexed(), 0.12);
  const roof = paint(new THREE.BoxGeometry(1.9, 0.08, 1.5).translate(-0.3, 1.8, 0).toNonIndexed(), 1);
  const tyres = [-1.4, 1.4].flatMap((x) =>
    [-0.82, 0.82].map((z) => paint(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10).rotateX(Math.PI / 2).translate(x, 0.34, z).toNonIndexed(), 0.05)),
  );
  return mergeGeometries([body, hood, cabin, roof, ...tyres]);
}

type Placed = { x: number; z: number; rot: number; color: string };

function parkedCars(data: CampusData): Placed[] {
  const rand = rng(1954);
  const out: Placed[] = [];
  const blockedBy = (x: number, z: number) => {
    for (const b of data.buildings) {
      if (Math.abs(b.center[0] - x) > 120 || Math.abs(b.center[1] - z) > 120) continue;
      if (pointInRing(x, z, b.outer)) return true;
    }
    return false;
  };
  const aisles = data.roads.filter((r) => r.kind === "service" && r.sub === "parking_aisle");
  // Cars nose-in on both sides of every aisle.
  for (const r of aisles) {
    const L = r.line;
    for (let i = 0; i + 3 < L.length; i += 2) {
      const dx = L[i + 2] - L[i], dz = L[i + 3] - L[i + 1];
      const len = Math.hypot(dx, dz);
      if (len < 3) continue;
      const nx = -dz / len, nz = dx / len;
      const rot = Math.atan2(-nz, nx);
      for (let s = 2; s < len - 1; s += 2.75) {
        const px = L[i] + (dx * s) / len, pz = L[i + 1] + (dz * s) / len;
        for (const side of [1, -1]) {
          if (rand() > 0.72) continue;
          const x = px + nx * 5.6 * side, z = pz + nz * 5.6 * side;
          if (blockedBy(x, z)) continue;
          out.push({ x, z, rot: rot + (side < 0 ? Math.PI : 0) + (rand() - 0.5) * 0.06, color: PAINT[Math.floor(rand() * PAINT.length)] });
        }
      }
    }
  }
  // Lots without mapped aisles: fill in double rows along the lot's long edge.
  const aislePts: [number, number][] = aisles.map((a) => [a.line[0], a.line[1]]);
  for (const a of data.areas) {
    if (a.kind !== "parking" || a.ring.length < 8) continue;
    const r = a.ring;
    if (aislePts.some(([x, z]) => pointInRing(x, z, r))) continue;
    if (Math.abs(signedArea(r)) < 250) continue;
    let best = 0, ang = 0;
    for (let i = 0; i < r.length; i += 2) {
      const j = (i + 2) % r.length;
      const len = Math.hypot(r[j] - r[i], r[j + 1] - r[i + 1]);
      if (len > best) { best = len; ang = Math.atan2(r[j + 1] - r[i + 1], r[j] - r[i]); }
    }
    const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      const u = r[i] * ux + r[i + 1] * uz, v = r[i] * vx + r[i + 1] * vz;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    for (let v = minV + 3; v < maxV - 2; v += 16.5) {
      for (const dv of [0, 5.2]) {
        for (let u = minU + 2; u < maxU - 1; u += 2.75) {
          if (rand() > 0.68) continue;
          const vv = v + dv;
          const x = u * ux + vv * vx, z = u * uz + vv * vz;
          if (!pointInRing(x, z, r) || !pointInRing(x + vx * 2.4, z + vz * 2.4, r) || !pointInRing(x - vx * 2.4, z - vz * 2.4, r)) continue;
          out.push({ x, z, rot: -Math.atan2(vz, vx) + (dv ? Math.PI : 0), color: PAINT[Math.floor(rand() * PAINT.length)] });
        }
      }
    }
  }
  return out.slice(0, 9000);
}

function ParkedCars({ data, geo }: { data: CampusData; geo: THREE.BufferGeometry }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(() => parkedCars(data), [data]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }), []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    cars.forEach((car, i) => {
      o.position.set(car.x, 0.02, car.z);
      o.rotation.set(0, car.rot, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(car.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [cars]);
  if (!cars.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, cars.length]} castShadow receiveShadow frustumCulled={false} />;
}

// ---------- moving traffic ----------

type Lane = { pts: Ring; cum: number[]; len: number };
type Mover = { lane: number; s: number; speed: number; dir: 1 | -1; color: string };

const DRIVEN = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "trunk", "motorway"]);
const LANE_OFF: Record<string, number> = { motorway: 5.5, trunk: 4, primary: 3.6, secondary: 3.2, tertiary: 2.4, residential: 2, unclassified: 2 };

function MovingTraffic({ data, geo, count = 260 }: { data: CampusData; geo: THREE.BufferGeometry; count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { lanes, movers, offs } = useMemo(() => {
    const lanes: Lane[] = [];
    const offs: number[] = [];
    for (const r of data.roads) {
      if (!DRIVEN.has(r.kind) || r.line.length < 4) continue;
      const cum = [0];
      for (let i = 2; i < r.line.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(r.line[i] - r.line[i - 2], r.line[i + 1] - r.line[i - 1]));
      const len = cum[cum.length - 1];
      if (len < 40) continue;
      lanes.push({ pts: r.line, cum, len });
      offs.push(LANE_OFF[r.kind] ?? 2);
    }
    const rand = rng(7);
    const total = lanes.reduce((a, l) => a + l.len, 0);
    const movers: Mover[] = [];
    for (let k = 0; k < count && lanes.length; k++) {
      let pick = rand() * total, li = 0;
      while (pick > lanes[li].len && li < lanes.length - 1) { pick -= lanes[li].len; li++; }
      movers.push({ lane: li, s: rand() * lanes[li].len, speed: 8 + rand() * 7, dir: rand() < 0.5 ? 1 : -1, color: PAINT[Math.floor(rand() * PAINT.length)] });
    }
    return { lanes, movers, offs };
  }, [data, count]);

  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }), []);
  const o = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const c = new THREE.Color();
    movers.forEach((mv, i) => m.setColorAt(i, c.set(mv.color)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [movers]);

  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const step = Math.min(dt, 0.1);
    movers.forEach((mv, i) => {
      const L = lanes[mv.lane];
      mv.s += mv.speed * step * mv.dir;
      if (mv.s > L.len) { mv.s = L.len; mv.dir = -1; }
      if (mv.s < 0) { mv.s = 0; mv.dir = 1; }
      // Find the segment for distance s.
      let seg = 0;
      while (seg < L.cum.length - 2 && L.cum[seg + 1] < mv.s) seg++;
      const t = (mv.s - L.cum[seg]) / Math.max(0.001, L.cum[seg + 1] - L.cum[seg]);
      const x0 = L.pts[seg * 2], z0 = L.pts[seg * 2 + 1], x1 = L.pts[seg * 2 + 2], z1 = L.pts[seg * 2 + 3];
      const dx = (x1 - x0) * mv.dir, dz = (z1 - z0) * mv.dir;
      const len = Math.hypot(dx, dz) || 1;
      // Drive on the right.
      const off = offs[mv.lane];
      const x = x0 + (x1 - x0) * t + (-dz / len) * -off;
      const z = z0 + (z1 - z0) * t + (dx / len) * -off;
      o.position.set(x, 0.12, z);
      o.rotation.set(0, Math.atan2(-dz, dx), 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  if (!movers.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, movers.length]} castShadow frustumCulled={false} />;
}

export default function Traffic({ data }: { data: CampusData }) {
  const geo = useMemo(() => carGeometry(), []);
  return (
    <group>
      <ParkedCars data={data} geo={geo} />
      <MovingTraffic data={data} geo={geo} />
    </group>
  );
}
