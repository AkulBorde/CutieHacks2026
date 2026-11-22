"use client";

// Owner: simulation
//
// Everything around the buildings: the painted campus ground (dry Riverside
// grass, irrigated lawns), a plain blank surface past the campus edge (the
// map is only UCR), and the sun.
import { useMemo } from "react";
import * as THREE from "three";
import type { CampusData } from "./campusData";
import { CAMPUS_BOUNDS, CAMPUS_BUFFER, CAMPUS_RINGS, styleOf } from "./campusData";

// ---------- deterministic value noise ----------

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
// ---------- painted ground ----------

// The painted ground covers the campus (scene metres); outside the campus
// outline it is painted BLANK to match the plain surface around it.
const G = { x0: CAMPUS_BOUNDS.x0 - 40, x1: CAMPUS_BOUNDS.x1 + 40, z0: CAMPUS_BOUNDS.z0 - 40, z1: CAMPUS_BOUNDS.z1 + 40 };

function paintGround(data: CampusData): THREE.CanvasTexture {
  const W = 4096;
  const sx = W / (G.x1 - G.x0), sz = W / (G.z1 - G.z0);
  const cv = document.createElement("canvas");
  cv.width = cv.height = W;
  const g = cv.getContext("2d")!;
  const X = (x: number) => (x - G.x0) * sx;
  const Z = (z: number) => (z - G.z0) * sz;

  // Dry inland-empire grass with large blotches.
  g.fillStyle = "#b8ad7e";
  g.fillRect(0, 0, W, W);
  const img = g.getImageData(0, 0, W, W);
  for (let py = 0; py < W; py += 2) {
    for (let px = 0; px < W; px += 2) {
      const n = fbm(px * 0.004, py * 0.004, 4);
      const d = (n - 0.5) * 46 + (Math.random() - 0.5) * 10;
      for (let k = 0; k < 4; k++) {
        const i = ((py + (k >> 1)) * W + px + (k & 1)) * 4;
        img.data[i] = Math.max(0, Math.min(255, img.data[i] + d));
        img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + d * 0.9));
        img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + d * 0.6));
      }
    }
  }
  g.putImageData(img, 0, 0);

  const blob = (x: number, z: number, r: number, color: string, alpha: number) => {
    const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * sx);
    grd.addColorStop(0, color.replace("A", String(alpha)));
    grd.addColorStop(0.65, color.replace("A", String(alpha * 0.8)));
    grd.addColorStop(1, color.replace("A", "0"));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(X(x), Z(z), r * sx, 0, Math.PI * 2);
    g.fill();
  };

  // Irrigated lawns around campus buildings and halls, yard lawns around houses.
  for (const b of data.buildings) {
    const s = styleOf(b);
    const [x, z] = b.center;
    if (s !== "house" && s !== "minor") {
      const r = Math.sqrt(b.area) * 0.9 + 34;
      blob(x, z, r, "rgba(104,140,66,A)", 0.85);
    } else if (s === "house") {
      blob(x, z, 15, "rgba(116,140,72,A)", 0.55);
    }
  }
  // Dirt lots and construction.
  for (const a of data.areas) {
    if (a.kind !== "construction" && a.kind !== "farmland") continue;
    g.fillStyle = a.kind === "construction" ? "rgba(176,152,112,0.9)" : "rgba(160,146,100,0.8)";
    g.beginPath();
    for (let i = 0; i < a.ring.length; i += 2) {
      const fn = i === 0 ? g.moveTo.bind(g) : g.lineTo.bind(g);
      fn(X(a.ring[i]), Z(a.ring[i + 1]));
    }
    g.closePath();
    g.fill();
  }
  // Grass texture speckle so lawns don't look airbrushed.
  for (let i = 0; i < 180000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? "rgba(70,90,40,0.10)" : "rgba(230,220,170,0.08)";
    g.fillRect(Math.random() * W, Math.random() * W, 2, 2);
  }

  // Blank out everything past the campus outline (plus the buffer).
  const mask = document.createElement("canvas");
  mask.width = mask.height = W;
  const m = mask.getContext("2d")!;
  m.fillStyle = BLANK;
  m.fillRect(0, 0, W, W);
  m.globalCompositeOperation = "destination-out";
  m.lineJoin = m.lineCap = "round";
  m.lineWidth = CAMPUS_BUFFER * 2 * sx;
  for (const r of CAMPUS_RINGS) {
    m.beginPath();
    for (let i = 0; i < r.length; i += 2) {
      if (i === 0) m.moveTo(X(r[i]), Z(r[i + 1]));
      else m.lineTo(X(r[i]), Z(r[i + 1]));
    }
    m.closePath();
    m.fill();
    m.stroke();
  }
  g.drawImage(mask, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function PaintedGround({ data }: { data: CampusData }) {
  const tex = useMemo(() => paintGround(data), [data]);
  const w = G.x1 - G.x0, d = G.z1 - G.z0;
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(G.x0 + G.x1) / 2, 0, (G.z0 + G.z1) / 2]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

// ---------- sun ----------

// Late-afternoon sun from the south-west: long shadows that read well from
// the default camera.
export const SUN_DIR = new THREE.Vector3(-0.78, 0.5, -0.32).normalize();

function Sun() {
  const pos = SUN_DIR.clone().multiplyScalar(1600);
  return (
    <>
      <hemisphereLight args={["#cfe0ff", "#9c8a62", 0.55]} />
      <directionalLight
        position={[pos.x, pos.y, pos.z]}
        intensity={3.1}
        color="#ffe9c7"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      >
        {/* Explicit camera: three.js won't re-project if only left/right change. */}
        <orthographicCamera attach="shadow-camera" args={[-1750, 1750, 1750, -1750, 100, 4000]} />
      </directionalLight>
    </>
  );
}

/** The plain colour of everything outside UCR (and the fog that meets it). */
export const BLANK = "#e9e7e1";

/**
 * Past the campus edge the world is one plain surface out to the horizon.
 * It has a hole exactly where the painted ground is, so the two never
 * overlap: stacked flat planes flicker (z-fight) when zoomed far out.
 */
function BlankGround() {
  const geo = useMemo(() => {
    const R = 20000;
    // Shape in (x, -z) so that after rotating onto the ground it lines up.
    const outer = new THREE.Shape([
      new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R),
    ]);
    // The hole sits 2 m inside the painted ground's edge (which is painted
    // BLANK there too), so there's no hairline crack along the seam.
    const e = 2;
    outer.holes.push(
      new THREE.Path([
        new THREE.Vector2(G.x0 + e, -G.z1 + e), new THREE.Vector2(G.x0 + e, -G.z0 - e), new THREE.Vector2(G.x1 - e, -G.z0 - e), new THREE.Vector2(G.x1 - e, -G.z1 + e),
      ]),
    );
    const g = new THREE.ShapeGeometry(outer);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color={BLANK} roughness={1} />
    </mesh>
  );
}

export default function Environment({ data }: { data: CampusData | null }) {
  return (
    <>
      <Sun />
      <BlankGround />
      {data && <PaintedGround data={data} />}
    </>
  );
}
