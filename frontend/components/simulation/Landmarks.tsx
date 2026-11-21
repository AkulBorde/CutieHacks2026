"use client";

// Owner: simulation
//
// Hand-built models for landmarks the OSM footprint can't capture. The generic
// block for each one is hidden (see LANDMARK_MATCHERS in CampusSim).
import { useMemo } from "react";
import * as THREE from "three";
import type { CampusBuilding } from "./campusData";

export const LANDMARK_MATCHERS: { key: "bellTower"; test: (b: CampusBuilding) => boolean }[] = [
  { key: "bellTower", test: (b) => /bell tower/i.test(b.name) },
];

const BRICK = "#9c5a43";
const CONCRETE = "#d8d1c4";

/**
 * UCR's Bell Tower (1966): a 49 m carillon tower. Brick shaft on a concrete
 * plinth, an open belfry with tall slots where the 48 bells hang, and a
 * slender cap.
 */
export function BellTower({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  const brick = useMemo(() => new THREE.MeshStandardMaterial({ color: BRICK, roughness: 0.9 }), []);
  const concrete = useMemo(() => new THREE.MeshStandardMaterial({ color: CONCRETE, roughness: 0.85 }), []);
  const bronze = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8a6a3a", metalness: 0.7, roughness: 0.4 }), []);
  const W = 7.5;
  const shaftH = 34;
  const belfryH = 9;
  const posts = [-1, 1];
  return (
    <group position={[x, 0, z]} rotation-y={rotation}>
      {/* Plinth and steps */}
      <mesh position={[0, 0.4, 0]} material={concrete} castShadow receiveShadow>
        <boxGeometry args={[W + 6, 0.8, W + 6]} />
      </mesh>
      <mesh position={[0, 1.2, 0]} material={concrete} castShadow>
        <boxGeometry args={[W + 2.4, 0.8, W + 2.4]} />
      </mesh>
      {/* Brick shaft with recessed vertical ribs */}
      <mesh position={[0, 1.6 + shaftH / 2, 0]} material={brick} castShadow receiveShadow>
        <boxGeometry args={[W, shaftH, W]} />
      </mesh>
      {[0, 1, 2, 3].map((side) => (
        <group key={side} rotation-y={(side * Math.PI) / 2}>
          {[-2.2, 0, 2.2].map((o) => (
            <mesh key={o} position={[o, 1.6 + shaftH / 2, W / 2 + 0.05]} material={concrete}>
              <boxGeometry args={[0.35, shaftH - 4, 0.12]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Concrete band under the belfry */}
      <mesh position={[0, 1.6 + shaftH + 0.6, 0]} material={concrete} castShadow>
        <boxGeometry args={[W + 1, 1.2, W + 1]} />
      </mesh>
      {/* Open belfry: corner piers and mid mullions, bells visible inside */}
      {posts.flatMap((sx) =>
        posts.map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * W) / 2.3, 1.6 + shaftH + 1.2 + belfryH / 2, (sz * W) / 2.3]} material={brick} castShadow>
            <boxGeometry args={[1.4, belfryH, 1.4]} />
          </mesh>
        )),
      )}
      {[0, 1].map((side) => (
        <group key={side} rotation-y={(side * Math.PI) / 2}>
          {[-1.3, 1.3].map((o) => (
            <mesh key={o} position={[o, 1.6 + shaftH + 1.2 + belfryH / 2, 0]} material={concrete} castShadow>
              <boxGeometry args={[0.35, belfryH, W - 0.6]} />
            </mesh>
          ))}
        </group>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 1.6 + shaftH + 3 + i * 2.4, 0]} material={bronze}>
          <cylinderGeometry args={[0.5 + i * 0.35, 0.9 + i * 0.45, 1.4, 12]} />
        </mesh>
      ))}
      {/* Roof slab and cap */}
      <mesh position={[0, 1.6 + shaftH + 1.2 + belfryH + 0.5, 0]} material={concrete} castShadow>
        <boxGeometry args={[W + 1.2, 1, W + 1.2]} />
      </mesh>
      <mesh position={[0, 1.6 + shaftH + 1.2 + belfryH + 1 + 1.8, 0]} material={brick} castShadow>
        <coneGeometry args={[W / 1.6, 3.6, 4]} />
      </mesh>
      <mesh position={[0, 1.6 + shaftH + 1.2 + belfryH + 1 + 3.6 + 1.2, 0]} material={bronze}>
        <cylinderGeometry args={[0.08, 0.08, 2.4, 6]} />
      </mesh>
    </group>
  );
}
