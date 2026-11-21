"use client";

// Owner: simulation
//
// Everything around the buildings: the painted ground (dry Riverside grass,
// irrigated campus lawns, yard lawns), the Box Springs Mountains to the east
// with UCR's "C", and the sun.
import { useMemo } from "react";
import * as THREE from "three";
import type { CampusData } from "./campusData";
import { styleOf } from "./campusData";

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
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- terrain: flat campus, Box Springs Mountains to the east ----------

/** Height of the land in metres. Zero across campus and the neighbourhoods. */
export function terrainHeight(x: number, z: number) {
  const east = smooth(1720, 3300, x + (fbm(z * 0.0012, 3.1) - 0.5) * 500);
  const ridge = fbm(x * 0.0009 + 11, z * 0.0009, 6);
  const crags = Math.abs(fbm(x * 0.004, z * 0.004 + 5, 4) - 0.5) * 2;
  let h = east * (120 + 330 * ridge + 60 * crags);
  // Rolling hills to the south (Sycamore Canyon / Canyon Crest).
  const south = smooth(1700, 3200, z) * (1 - smooth(-200, 600, -x));
  h += south * (40 + 120 * fbm(x * 0.0015, z * 0.0015 + 9));
  return h;
}

// The big white "C" on Box Springs Mountain, facing campus.
const C_POS = { x: 2230, z: -760 };

function Terrain() {
  const geo = useMemo(() => {
    const size = 14000, seg = 260;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    g.translate(2200, 0, 0);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const lowland = new THREE.Color("#b9ad80");
    const chaparral = new THREE.Color("#7f7651");
    const scrubDark = new THREE.Color("#5f5a3d");
    const rock = new THREE.Color("#a9977a");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h - 0.6);
      const n = fbm(x * 0.01, z * 0.01, 3);
      const t = Math.min(1, h / 90);
      c.copy(lowland).lerp(n > 0.55 ? scrubDark : chaparral, t);
      if (h > 260 && n > 0.6) c.lerp(rock, 0.6);
      c.multiplyScalar(0.92 + n * 0.16);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

function TheC() {
  const y = terrainHeight(C_POS.x, C_POS.z);
  // Face west toward campus, tilted back to lie on the slope.
  const slope = Math.atan2(terrainHeight(C_POS.x + 30, C_POS.z) - terrainHeight(C_POS.x - 30, C_POS.z), 60);
  return (
    <group position={[C_POS.x, y + 2, C_POS.z]} rotation={[0, -Math.PI / 2, 0]}>
      <group rotation-x={-(Math.PI / 2 - slope)}>
        <mesh rotation-z={Math.PI * 0.2} castShadow>
          <torusGeometry args={[34, 7, 6, 40, Math.PI * 1.6]} />
          <meshStandardMaterial color="#f4f1ea" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

// ---------- painted ground ----------

// The flat ground covers this rectangle (scene metres).
const G = { x0: -2700, x1: 1760, z0: -2500, z1: 2000 };

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
    if (s === "campus" || s === "housing") {
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

export default function Environment({ data }: { data: CampusData | null }) {
  return (
    <>
      <Sun />
      <Terrain />
      <TheC />
      {data && <PaintedGround data={data} />}
    </>
  );
}
