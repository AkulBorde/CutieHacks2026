"use client";

// Owner: simulation
//
// The 3D UCR campus the demo plays out on. three.js touches `window`, so this
// file must only load in the browser: import it with next/dynamic and
// ssr: false (see app/sim/page.tsx).
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, MapControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import { type CampusData, heightOf, loadCampus } from "./campusData";
import CampusWorld from "./CampusWorld";
import { BellTower, LANDMARK_MATCHERS } from "./Landmarks";

export type CampusSimProps = {
  className?: string;
};

const SUN: [number, number, number] = [420, 520, 260];

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[9000, 9000]} />
      <meshStandardMaterial color="#c8b893" roughness={1} />
    </mesh>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#dbe7ff", "#b39d76", 0.75]} />
      <directionalLight
        position={SUN}
        intensity={2.4}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-camera-left={-1100}
        shadow-camera-right={1100}
        shadow-camera-top={1100}
        shadow-camera-bottom={-1100}
        shadow-camera-near={10}
        shadow-camera-far={2400}
      />
    </>
  );
}

function HoverLabel({ data, bid }: { data: CampusData; bid: number | null }) {
  if (bid == null) return null;
  const b = data.buildings[bid];
  if (!b) return null;
  const label = b.housing ?? (b.name || null);
  if (!label) return null;
  return (
    <Html position={[b.center[0], heightOf(b) + 6, b.center[1]]} center zIndexRange={[20, 0]}>
      <div className="pointer-events-none whitespace-nowrap rounded-md bg-zinc-900/85 px-2 py-1 text-xs font-medium text-white shadow">
        {label}
        {b.housing && b.name && b.name !== b.housing ? (
          <span className="ml-1 text-zinc-400">· {b.name}</span>
        ) : null}
      </div>
    </Html>
  );
}

export default function CampusSim({ className }: CampusSimProps) {
  const [data, setData] = useState<CampusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [status, setStatus] = useState("Loading UCR campus...");

  useEffect(() => {
    loadCampus(setStatus).then(setData, (e) => setError(String(e)));
  }, []);

  // Landmarks get a hand-built model; hide their generic block.
  const landmarks = useMemo(() => {
    const hide = new Set<number>();
    let bell: [number, number] | null = null;
    data?.buildings.forEach((b, i) => {
      for (const m of LANDMARK_MATCHERS) {
        if (!m.test(b)) continue;
        hide.add(i);
        if (m.key === "bellTower") bell = b.center;
      }
    });
    return { hide, bell: bell as [number, number] | null };
  }, [data]);

  const camera = useMemo(
    () => ({ position: [-520, 430, 560] as [number, number, number], fov: 38, near: 2, far: 9000 }),
    [],
  );

  return (
    <div className={`relative ${className ?? "h-full w-full"}`}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={camera}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
        style={{ cursor: hover != null ? "pointer" : "grab" }}
      >
        <fog attach="fog" args={["#d9e4ee", 1400, 5200]} />
        <Sky sunPosition={SUN} turbidity={5} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.85} />
        <Lights />
        <Ground />
        {data && <CampusWorld data={data} hide={landmarks.hide} onHover={setHover} />}
        {landmarks.bell && <BellTower x={landmarks.bell[0]} z={landmarks.bell[1]} />}
        {data && <HoverLabel data={data} bid={hover} />}
        <MapControls
          makeDefault
          target={[200, 0, -250]}
          maxPolarAngle={Math.PI / 2.2}
          minDistance={30}
          maxDistance={3200}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
      {!data && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
          {error ? `Could not load campus: ${error}` : status}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-zinc-700/80">
        Map data © OpenStreetMap contributors
      </div>
    </div>
  );
}
