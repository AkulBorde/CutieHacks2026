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
  /** Index of a building to make invisible (it's being shown as a cutaway). */
  xray?: number | null;
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

// Hides one building inside the merged meshes without rebuilding them: the
// shader discards fragments whose `bid` matches uHide.
function withHide<T extends THREE.Material>(m: T, uHide: { value: number }): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHide = uHide;
    sh.vertexShader = "attribute float bid;\nvarying float vBid;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vBid = bid;");
    sh.fragmentShader = "uniform float uHide;\nvarying float vBid;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n  if (abs(vBid - uHide) < 0.5) discard;");
  };
  m.customProgramCacheKey = () => "hide-bid";
  return m;
}

export default function CampusWorld({ data, hide, xray = null, onHover, onPick, onInspect }: CampusWorldProps & { onInspect?: (bid: number) => void }) {
  const uHide = useMemo(() => ({ value: -1 }), []);
  useEffect(() => {
    uHide.value = xray ?? -1;
  }, [xray, uHide]);
  const depthMat = useMemo(() => withHide(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uHide), [uHide]);
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
          withHide(
            new THREE.MeshStandardMaterial({
              vertexColors: true,
              map: facadeTexture(s),
              roughness: 0.82,
              metalness: 0.02,
            }),
            uHide,
          ),
        ]),
      ) as Record<Style, THREE.MeshStandardMaterial>,
    [uHide],
  );
  const roofMat = useMemo(
    () => withHide(new THREE.MeshStandardMaterial({ vertexColors: true, map: noiseTexture(3, 40), roughness: 0.95 }), uHide),
    [uHide],
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
      const id = bidFromEvent(e);
      // The x-rayed building is invisible; let the pointer reach what's inside it.
      if (id != null && id === xray) return;
      e.stopPropagation();
      onHover?.(id);
    },
    onPointerOut: () => onHover?.(null),
    onDoubleClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = bidFromEvent(e);
      if (id != null) onInspect?.(id);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const id = bidFromEvent(e);
      if (id != null && id === xray) return;
      e.stopPropagation();
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
          <mesh geometry={g.walls[s]} material={wallMats[s]} customDepthMaterial={depthMat} castShadow receiveShadow {...pointer} />
          <mesh geometry={g.roofs[s]} material={roofMat} customDepthMaterial={depthMat} castShadow receiveShadow {...pointer} />
        </group>
      ))}
      <Vegetation data={data} />
      <Traffic data={data} />
    </group>
  );
}
