"use client";

// Owner: simulation
//
// The 3D UCR campus the demo plays out on. three.js touches `window`, so this
// file must only load in the browser: import it with next/dynamic and
// ssr: false (see app/sim/page.tsx).
import { Canvas } from "@react-three/fiber";
import { MapControls, Sky } from "@react-three/drei";

export type CampusSimProps = {
  className?: string;
};

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[4000, 4000]} />
      <meshStandardMaterial color="#c9b99a" />
    </mesh>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#dfe9ff", "#b8a27c", 0.6]} />
      <directionalLight
        position={[300, 500, 200]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-900}
        shadow-camera-right={900}
        shadow-camera-top={900}
        shadow-camera-bottom={-900}
        shadow-camera-far={2000}
      />
    </>
  );
}

export default function CampusSim({ className }: CampusSimProps) {
  return (
    <div className={className ?? "h-full w-full"}>
      <Canvas
        shadows
        camera={{ position: [-450, 420, 520], fov: 40, near: 1, far: 8000 }}
      >
        <color attach="background" args={["#cfe3f5"]} />
        <fog attach="fog" args={["#cfe3f5", 1500, 4000]} />
        <Sky sunPosition={[300, 500, 200]} turbidity={6} rayleigh={1.2} />
        <Lights />
        <Ground />
        {/* Bell Tower placeholder so the origin is visible */}
        <mesh position={[0, 20, 0]} castShadow>
          <boxGeometry args={[8, 40, 8]} />
          <meshStandardMaterial color="#d9c7a3" />
        </mesh>
        <MapControls
          makeDefault
          maxPolarAngle={Math.PI / 2.15}
          minDistance={40}
          maxDistance={2500}
        />
      </Canvas>
    </div>
  );
}
