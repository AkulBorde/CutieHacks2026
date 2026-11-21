"use client";

// Owner: simulation
//
// The 3D UCR campus the demo plays out on. three.js touches `window`, so this
// file must only load in the browser: import it with next/dynamic and
// ssr: false (see app/sim/page.tsx).
import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, MapControls, Sky } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette, BrightnessContrast, HueSaturation } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { type CampusData, heightOf, loadCampus } from "./campusData";
import CampusWorld from "./CampusWorld";
import Environment, { SUN_DIR } from "./Environment";
import { BellTower, LANDMARK_MATCHERS } from "./Landmarks";

export type CampusSimProps = {
  className?: string;
  /** "high" adds ambient occlusion; drop to "low" on weak laptops. */
  quality?: "high" | "low";
};

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
        {b.housing && b.name && b.name !== b.housing ? <span className="ml-1 text-zinc-400">· {b.name}</span> : null}
      </div>
    </Html>
  );
}

function PostFX({ quality }: { quality: "high" | "low" }) {
  return (
    <EffectComposer multisampling={0}>
      {quality === "high" ? (
        <N8AO halfRes aoRadius={9} distanceFalloff={1.2} intensity={2.6} quality="medium" color="#1c1a16" />
      ) : (
        <></>
      )}
      <SMAA />
      <HueSaturation saturation={0.08} />
      <BrightnessContrast contrast={0.06} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.42} />
    </EffectComposer>
  );
}

export default function CampusSim({ className, quality = "high" }: CampusSimProps) {
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

  const sun = useMemo(() => SUN_DIR.clone().multiplyScalar(1000).toArray() as [number, number, number], []);

  return (
    <div className={`relative ${className ?? "h-full w-full"}`}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [-330, 300, 420], fov: 40, near: 2, far: 16000 }}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
        style={{ cursor: hover != null ? "pointer" : "grab" }}
      >
        <fog attach="fog" args={["#c9d6e2", 1800, 9000]} />
        <Sky sunPosition={sun} turbidity={4.5} rayleigh={0.9} mieCoefficient={0.005} mieDirectionalG={0.82} distance={20000} />
        <Environment data={data} />
        {data && <CampusWorld data={data} hide={landmarks.hide} onHover={setHover} />}
        {landmarks.bell && <BellTower x={landmarks.bell[0]} z={landmarks.bell[1]} />}
        {data && <HoverLabel data={data} bid={hover} />}
        <MapControls
          makeDefault
          target={[180, 0, -180]}
          maxPolarAngle={Math.PI / 2.15}
          minDistance={30}
          maxDistance={4200}
          enableDamping
          dampingFactor={0.08}
        />
        <PostFX quality={quality} />
      </Canvas>
      {!data && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-zinc-900/80 px-4 py-2 text-sm text-white">
            {error ? `Could not load campus: ${error}` : status}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-zinc-700/80">
        Map data © OpenStreetMap contributors
      </div>
    </div>
  );
}
