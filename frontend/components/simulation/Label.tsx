"use client";

// Owner: simulation
//
// A floating HTML label pinned to a point in the 3D scene, centred on it and
// never catching the mouse. Stands in for drei's <Html>, which unmounts its
// own React root in the middle of a commit: React 19 rejects that and threw
// "removeChild ... not a child of this node" whenever a building closed.
// Here the root is unmounted just after the commit instead.
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";

const world = new THREE.Vector3();
const view = new THREE.Vector3();

export default function Label({
  position,
  zIndexRange = [20, 0],
  children,
}: {
  position: [number, number, number];
  /** Nearer labels stack above farther ones, within this range. */
  zIndexRange?: [number, number];
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const elRef = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);

  useLayoutEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;display:none;";
    gl.domElement.parentNode?.appendChild(el);
    const r = createRoot(el);
    elRef.current = el;
    root.current = r;
    return () => {
      elRef.current = null;
      root.current = null;
      el.remove();
      // Unmounting a root during another root's commit is what React rejects.
      queueMicrotask(() => r.unmount());
    };
  }, [gl]);

  useLayoutEffect(() => {
    root.current?.render(<div style={{ position: "absolute", transform: "translate3d(-50%,-50%,0)" }}>{children}</div>);
  });

  useFrame(({ camera, size }) => {
    const g = group.current, el = elRef.current;
    if (!g || !el) return;
    g.getWorldPosition(world);
    view.copy(world).applyMatrix4(camera.matrixWorldInverse);
    // Behind the camera: hide instead of drawing a mirrored label.
    if (view.z > 0) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    world.project(camera);
    const x = (world.x * 0.5 + 0.5) * size.width;
    const y = (-world.y * 0.5 + 0.5) * size.height;
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
    const persp = camera as THREE.PerspectiveCamera;
    const t = Math.min(1, Math.max(0, (-view.z - persp.near) / (persp.far - persp.near)));
    el.style.zIndex = String(Math.round(zIndexRange[0] + (zIndexRange[1] - zIndexRange[0]) * t));
  });

  return <group ref={group} position={position} />;
}
