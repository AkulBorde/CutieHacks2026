"use client";

// Owner: simulation
//
// The static campus: every building, lawn, road, walkway and tree, built from
// real OpenStreetMap data (public/ucr/campus.json).
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { CampusData, Style } from "./campusData";
import { buildAreas, buildBuildings, buildRoads, scatterTrees, type TreeSpot } from "./buildGeometry";
import { facadeTexture, noiseTexture } from "./textures";

const STYLES: Style[] = ["campus", "housing", "house", "minor"];

export type CampusWorldProps = {
  data: CampusData;
  /** Buildings with their own detailed model hide the generic block. */
  hide?: Set<number>;
  onHover?: (bid: number | null) => void;
  onPick?: (bid: number) => void;
};

function bidFromEvent(e: ThreeEvent<PointerEvent | MouseEvent>): number | null {
  const geo = (e.object as THREE.Mesh).geometry as THREE.BufferGeometry;
  const attr = geo.getAttribute("bid");
  if (!attr || e.face == null) return null;
  const id = attr.getX(e.face.a);
  return id >= 0 ? id : null;
}

export default function CampusWorld({ data, hide, onHover, onPick }: CampusWorldProps) {
  const g = useMemo(
    () => buildBuildings(data.buildings, hide?.size ? (_b, i) => hide.has(i) : undefined),
    [data, hide],
  );

  const ground = useMemo(() => buildAreas(data.areas), [data]);
  const roads = useMemo(() => buildRoads(data.roads), [data]);
  const trees = useMemo(() => scatterTrees(data.areas, data.trees, data.buildings), [data]);

  const wallMats = useMemo(
    () =>
      Object.fromEntries(
        STYLES.map((s) => [
          s,
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            map: facadeTexture(s),
            roughness: 0.82,
            metalness: 0.02,
          }),
        ]),
      ) as Record<Style, THREE.MeshStandardMaterial>,
    [],
  );
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, map: noiseTexture(3, 40), roughness: 0.95 }),
    [],
  );
  const groundMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: noiseTexture(2.5, 55),
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      }),
    [],
  );
  const asphaltMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: noiseTexture(1.5, 35),
        roughness: 0.92,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -6,
      }),
    [],
  );
  const walkMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: noiseTexture(1.2, 30),
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      }),
    [],
  );

  useEffect(
    () => () => {
      for (const s of STYLES) {
        g.walls[s].dispose();
        g.roofs[s].dispose();
      }
    },
    [g],
  );

  const pointer = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover?.(bidFromEvent(e));
    },
    onPointerOut: () => onHover?.(null),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = bidFromEvent(e);
      if (id != null) onPick?.(id);
    },
  };

  return (
    <group>
      <mesh geometry={ground} material={groundMat} receiveShadow />
      <mesh geometry={roads.walk} material={walkMat} receiveShadow />
      <mesh geometry={roads.car} material={asphaltMat} receiveShadow />
      {STYLES.map((s) => (
        <group key={s}>
          <mesh geometry={g.walls[s]} material={wallMats[s]} castShadow receiveShadow {...pointer} />
          <mesh geometry={g.roofs[s]} material={roofMat} castShadow receiveShadow {...pointer} />
        </group>
      ))}
      <Trees spots={trees} />
    </group>
  );
}

// ---------- trees: instanced, four species ----------

const SPECIES = {
  oak: { trunkH: 3.2, canopy: () => new THREE.IcosahedronGeometry(3.4, 1), cy: 5.6, color: "#7a9a4c", sy: 0.85 },
  citrus: { trunkH: 1.0, canopy: () => new THREE.IcosahedronGeometry(2.0, 1), cy: 2.3, color: "#5c8a3e", sy: 0.9 },
  pine: { trunkH: 2.0, canopy: () => new THREE.ConeGeometry(2.6, 8, 7), cy: 6.0, color: "#62804a", sy: 1 },
  palm: { trunkH: 11, canopy: () => new THREE.IcosahedronGeometry(2.6, 0), cy: 11.5, color: "#8aa64f", sy: 0.45 },
} as const;

function Trees({ spots }: { spots: TreeSpot[] }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const byKind = useMemo(() => {
    const m: Record<string, TreeSpot[]> = { oak: [], citrus: [], pine: [], palm: [] };
    for (const t of spots) m[t.kind].push(t);
    return m;
  }, [spots]);

  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.22, 0.32, 1, 6).translate(0, 0.5, 0), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6b5440", roughness: 1 }), []);

  useLayoutEffect(() => {
    const m = trunkRef.current;
    if (!m) return;
    const o = new THREE.Object3D();
    spots.forEach((t, i) => {
      const sp = SPECIES[t.kind];
      o.position.set(t.x, 0, t.z);
      o.scale.set(t.s * (t.kind === "palm" ? 1.2 : 1), sp.trunkH * t.s, t.s * (t.kind === "palm" ? 1.2 : 1));
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, trunkMat, Math.max(1, spots.length)]} castShadow />
      {(Object.keys(SPECIES) as (keyof typeof SPECIES)[]).map((k) => (
        <Canopies key={k} kind={k} spots={byKind[k]} />
      ))}
    </group>
  );
}

function Canopies({ kind, spots }: { kind: keyof typeof SPECIES; spots: TreeSpot[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const sp = SPECIES[kind];
  const geo = useMemo(() => sp.canopy(), [sp]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: sp.color, roughness: 0.95, flatShading: true }), [sp]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((t, i) => {
      o.position.set(t.x, sp.cy * t.s, t.z);
      o.scale.set(t.s, t.s * sp.sy, t.s);
      o.rotation.set(0, (t.x * 13.7 + t.z * 7.3) % (Math.PI * 2), 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.set(sp.color).multiplyScalar(0.85 + (((t.x * 31 + t.z * 17) % 100) / 100) * 0.3);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots, sp]);
  if (!spots.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} castShadow receiveShadow />;
}
