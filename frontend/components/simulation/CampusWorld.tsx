"use client";

// Owner: simulation
//
// The static campus: every building, lawn, road, walkway and tree, built from
// real OpenStreetMap data (public/ucr/campus.json).
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { CampusData, Style } from "./campusData";
import { buildAreas, buildBuildings, buildMarkings, buildRoads } from "./buildGeometry";
import Traffic from "./Traffic";
import Vegetation from "./Vegetation";
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
  const markings = useMemo(() => buildMarkings(data.roads), [data]);

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

  const markMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -8,
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
      <mesh geometry={markings} material={markMat} receiveShadow />
      {STYLES.map((s) => (
        <group key={s}>
          <mesh geometry={g.walls[s]} material={wallMats[s]} castShadow receiveShadow {...pointer} />
          <mesh geometry={g.roofs[s]} material={roofMat} castShadow receiveShadow {...pointer} />
        </group>
      ))}
      <Vegetation data={data} />
      <Traffic data={data} />
    </group>
  );
}
