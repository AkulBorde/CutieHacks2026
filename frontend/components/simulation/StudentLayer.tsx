"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs --
   three.js scene objects (instance matrices, uniforms, materials) are updated
   in place every frame on purpose; they are GPU data, not React state. */

// Owner: simulation
//
// Everything about people on the 3D campus: one pin per student above their
// residence hall (coloured by check status, hollow ring if simulated), red
// pulses and light beams on anyone who needs help, the selected zone, and
// responders walking to students.
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { STATUS_COLORS } from "@/lib/status";
import { type CampusBuilding, type CampusData, hallIndexOf, heightOf } from "./campusData";
import { buildSingle, pointInRing } from "./buildGeometry";
import { hallBuildingFor } from "./floorPlan";
import { toScene } from "./geo";

export type CheckStatus = "pending" | "calling" | "safe" | "needs_help" | "urgent" | "no_answer";

/** Same shape as StudentDot in components/CampusMap.tsx. */
export type SimStudentDot = {
  checkId: string;
  studentName: string;
  status: CheckStatus;
  isReal: boolean;
  lat: number;
  lng: number;
  /** Optional: the building name, so the pin lands on the right hall. */
  buildingName?: string;
  room?: string;
};

export type SimResponder = {
  id: string;
  name: string;
  role: string;
  from: [number, number]; // lat, lng
  toCheckId: string;
  status: "offered" | "accepted" | "arrived";
  etaMinutes: number;
  /** 0..1 along the walk, for animation. */
  progress: number;
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Index of housing communities -> the 3D buildings that make them up. */
export function useHallIndex(data: CampusData) {
  return useMemo(() => hallIndexOf(data), [data]);
}

/** Where a student's pin goes: on top of one of their hall's real buildings. */
export function pinPosition(
  s: SimStudentDot,
  data: CampusData,
  halls: Map<string, number[]>,
): { x: number; z: number; y: number; ground: number; bid: number } {
  const ids = s.buildingName ? halls.get(s.buildingName) : undefined;
  const h = hash(s.checkId);
  if (ids?.length) {
    const bid = hallBuildingFor(s.checkId, s.room, ids, data);
    const b: CampusBuilding = data.buildings[bid];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < b.outer.length; i += 2) {
      minX = Math.min(minX, b.outer[i]); maxX = Math.max(maxX, b.outer[i]);
      minZ = Math.min(minZ, b.outer[i + 1]); maxZ = Math.max(maxZ, b.outer[i + 1]);
    }
    let r = h;
    for (let k = 0; k < 40; k++) {
      r = Math.imul(r ^ (r >>> 13), 1274126177) >>> 0;
      const x = minX + ((r & 0xffff) / 0xffff) * (maxX - minX);
      const z = minZ + ((r >>> 16) / 0xffff) * (maxZ - minZ);
      if (pointInRing(x, z, b.outer)) return { x, z, y: heightOf(b) + 9, ground: heightOf(b), bid };
    }
    return { x: b.center[0], z: b.center[1], y: heightOf(b) + 9, ground: heightOf(b), bid };
  }
  const [x, z] = toScene(s.lat, s.lng);
  const a = ((h % 360) * Math.PI) / 180, d = Math.sqrt(((h >>> 9) % 1000) / 1000) * 60;
  return { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, y: 22, ground: 0, bid: -1 };
}

// ---------- pins ----------

const SPHERE = new THREE.SphereGeometry(2.8, 18, 12);
const RING = new THREE.TorusGeometry(2.6, 0.6, 8, 24);
const POLE = new THREE.CylinderGeometry(0.12, 0.12, 1, 6).translate(0, 0.5, 0);

export function StudentPins({
  data,
  students,
  halls,
  onPick,
  hideBid = null,
}: {
  data: CampusData;
  students: SimStudentDot[];
  halls: Map<string, number[]>;
  onPick?: (checkId: string) => void;
  /** Students inside the building being viewed as a cutaway get no pin. */
  hideBid?: number | null;
}) {
  const solidRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);

  const placed = useMemo(
    () => students.map((s) => ({ s, p: pinPosition(s, data, halls) })).filter((x) => x.p.bid !== hideBid || hideBid == null),
    [students, data, halls, hideBid],
  );
  const solid = useMemo(() => placed.filter((x) => x.s.isReal), [placed]);
  const hollow = useMemo(() => placed.filter((x) => !x.s.isReal), [placed]);

  const solidMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.3, emissive: "#ffffff", emissiveIntensity: 0.25, toneMapped: false }), []);
  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: "#ffffff", emissiveIntensity: 0.2, toneMapped: false }), []);
  const poleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2b2b2b", transparent: true, opacity: 0.55 }), []);

  // Colours change only when statuses change.
  useLayoutEffect(() => {
    const c = new THREE.Color();
    const paint = (m: THREE.InstancedMesh | null, list: typeof placed) => {
      if (!m) return;
      list.forEach((x, i) => m.setColorAt(i, c.set(STATUS_COLORS[x.s.status])));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    paint(solidRef.current, solid);
    paint(ringRef.current, hollow);
  }, [solid, hollow]);

  // Positions every frame: bob, pulse anyone waiting or in trouble, and turn
  // the hollow rings to face the camera.
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const place = (m: THREE.InstancedMesh | null, list: typeof placed, face: boolean) => {
      if (!m) return;
      list.forEach((x, i) => {
        const st = x.s.status;
        const pulse =
          st === "urgent" ? 1 + 0.35 * Math.abs(Math.sin(t * 5)) :
          st === "needs_help" ? 1 + 0.25 * Math.abs(Math.sin(t * 3)) :
          st === "calling" ? 1 + 0.12 * Math.sin(t * 8) : 1;
        const big = x.s.isReal ? 1.35 : 1;
        o.position.set(x.p.x, x.p.y + Math.sin(t * 1.6 + x.p.x) * 0.5, x.p.z);
        if (face) o.quaternion.copy(camera.quaternion);
        else o.quaternion.identity();
        o.scale.setScalar(pulse * big);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    };
    place(solidRef.current, solid, false);
    place(ringRef.current, hollow, true);
  });

  useLayoutEffect(() => {
    const m = poleRef.current;
    if (!m) return;
    placed.forEach((x, i) => {
      o.position.set(x.p.x, x.p.ground, x.p.z);
      o.quaternion.identity();
      o.scale.set(1, Math.max(0.1, x.p.y - x.p.ground - 2), 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [placed, o]);

  const pick = (list: typeof placed) => (e: { stopPropagation: () => void; instanceId?: number }) => {
    e.stopPropagation();
    if (e.instanceId != null) onPick?.(list[e.instanceId].s.checkId);
  };

  return (
    <group>
      {placed.length > 0 && <instancedMesh ref={poleRef} args={[POLE, poleMat, placed.length]} frustumCulled={false} />}
      {solid.length > 0 && (
        <instancedMesh ref={solidRef} args={[SPHERE, solidMat, solid.length]} frustumCulled={false} onClick={pick(solid)} />
      )}
      {hollow.length > 0 && (
        <instancedMesh ref={ringRef} args={[RING, ringMat, hollow.length]} frustumCulled={false} onClick={pick(hollow)} />
      )}
      {placed
        .filter((x) => x.s.status === "needs_help" || x.s.status === "urgent")
        .map((x) => (
          <Distress key={x.s.checkId} x={x.p.x} z={x.p.z} top={x.p.y} ground={x.p.ground} urgent={x.s.status === "urgent"} name={x.s.studentName} room={x.s.room} />
        ))}
    </group>
  );
}

/** Expanding red rings on the ground and a light beam into the sky. */
function Distress({ x, z, top, ground, urgent, name, room }: { x: number; z: number; top: number; ground: number; urgent: boolean; name: string; room?: string }) {
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const color = urgent ? "#ff2a2a" : "#ff5a36";
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (urgent ? 1.4 : 1);
    [r1.current, r2.current].forEach((m, k) => {
      if (!m) return;
      const p = (t * 0.6 + k * 0.5) % 1;
      m.scale.setScalar(4 + p * 38);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.7;
    });
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.1 * Math.sin(t * 4);
  });
  return (
    <group position={[x, 0, z]}>
      {[r1, r2].map((r, k) => (
        <mesh key={k} ref={r} rotation-x={-Math.PI / 2} position-y={ground + 0.4 + k * 0.05}>
          <ringGeometry args={[0.92, 1, 48]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh ref={beam} position-y={top + 90}>
        <cylinderGeometry args={[1.6, 1.6, 180, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Html position={[0, top + 7, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
        <div className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-white shadow-lg ${urgent ? "bg-red-900" : "bg-red-600"}`}>
          {urgent ? "URGENT · " : "Needs help · "}
          {name}
          {room ? <span className="font-normal opacity-80"> · {room}</span> : null}
        </div>
      </Html>
    </group>
  );
}

// ---------- the selected zone ----------

export function ZoneHighlight({ data, indices, active }: { data: CampusData; indices: number[]; active: boolean }) {
  const geo = useMemo(() => {
    const gs = indices.map((i) => buildSingle(data.buildings[i], 0.6));
    if (!gs.length) return null;
    const merged = new THREE.BufferGeometry();
    // Concatenate positions/normals (buildSingle output is non-indexed).
    const pos: number[] = [], nor: number[] = [];
    for (const g of gs) {
      pos.push(...(g.getAttribute("position").array as Float32Array));
      nor.push(...(g.getAttribute("normal").array as Float32Array));
    }
    merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    // The outline (corners, eaves, footprint) marks the zone without hiding
    // what the buildings look like.
    return { shell: merged, edges: new THREE.EdgesGeometry(merged, 25) };
  }, [data, indices]);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const line = useRef<THREE.LineBasicMaterial>(null);
  useFrame(({ clock }) => {
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3);
    if (mat.current) mat.current.opacity = active ? 0.06 + 0.1 * pulse : 0.05;
    if (line.current) line.current.opacity = active ? 0.55 + 0.45 * pulse : 0.85;
  });
  if (!geo) return null;
  const color = active ? "#ff3b30" : "#3b82f6";
  return (
    <group>
      <mesh geometry={geo.shell} renderOrder={5}>
        <meshBasicMaterial ref={mat} color={color} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <lineSegments geometry={geo.edges} renderOrder={6}>
        <lineBasicMaterial ref={line} color={color} transparent depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

// ---------- responders ----------

export function Responders({ responders, targets }: { responders: SimResponder[]; targets: Map<string, { x: number; z: number; ground: number }> }) {
  return (
    <group>
      {responders.map((r) => {
        const t = targets.get(r.toCheckId);
        if (!t) return null;
        const [fx, fz] = toScene(r.from[0], r.from[1]);
        const p = Math.min(1, Math.max(0, r.progress));
        const x = fx + (t.x - fx) * p, z = fz + (t.z - fz) * p;
        return (
          <group key={r.id}>
            <mesh position={[x, 1.8, z]} castShadow>
              <capsuleGeometry args={[0.9, 1.8, 4, 10]} />
              <meshStandardMaterial color="#2563eb" emissive="#3b82f6" emissiveIntensity={0.6} toneMapped={false} />
            </mesh>
            <mesh position={[x, 0.3, z]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[3, 4, 32]} />
              <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} toneMapped={false} />
            </mesh>
            {r.status !== "arrived" && <WalkLine from={[fx, fz]} to={[t.x, t.z]} progress={p} />}
            <Html position={[x, 7, z]} center zIndexRange={[25, 0]} style={{ pointerEvents: "none" }}>
              <div className="whitespace-nowrap rounded-md bg-blue-700 px-2 py-1 text-xs font-semibold text-white shadow-lg">
                {r.name} ({r.role}) ·{" "}
                {r.status === "arrived" ? "on scene" : r.status === "offered" ? "offer sent" : `${Math.max(1, Math.ceil(r.etaMinutes * (1 - p)))} min away`}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function WalkLine({ from, to, progress }: { from: [number, number]; to: [number, number]; progress: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setFromPoints([new THREE.Vector3(from[0], 0.6, from[1]), new THREE.Vector3(to[0], 0.6, to[1])]);
    return g;
  }, [from, to]);
  const mat = useMemo(() => new THREE.LineDashedMaterial({ color: "#60a5fa", dashSize: 4, gapSize: 3, transparent: true, opacity: 0.9 }), []);
  const line = useMemo(() => {
    const l = new THREE.Line(geo, mat);
    l.computeLineDistances();
    return l;
  }, [geo, mat]);
  void progress;
  return <primitive object={line} />;
}
