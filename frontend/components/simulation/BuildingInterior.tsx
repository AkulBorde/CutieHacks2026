"use client";

// Owner: simulation
//
// X-ray view of one building: the outer shell turns to glass, floors above
// the one being viewed are lifted away, and the viewed floor shows every room
// (walls, numbers, hallway) with the students in it. The student who needs
// help stands in their actual room, highlighted.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status";
import { type CampusBuilding, heightOf } from "./campusData";
import { type Cell, type FloorPlan, cellsOn, floorY, realToScene, roomLabel } from "./floorPlan";
import type { CheckStatus } from "./StudentLayer";

export type Occupant = {
  checkId: string;
  name: string;
  status: CheckStatus;
  room: string;
  floor: number;
  cell: Cell;
  isReal: boolean;
};

const SLAB = 0.28;
const WALL_H = 2.2;

function footprintShape(b: CampusBuilding) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < b.outer.length; i += 2) pts.push(new THREE.Vector2(b.outer[i], -b.outer[i + 1]));
  const shape = new THREE.Shape(pts);
  for (const h of b.holes) {
    if (h.length < 6) continue;
    const hp: THREE.Vector2[] = [];
    for (let i = 0; i < h.length; i += 2) hp.push(new THREE.Vector2(h[i], -h[i + 1]));
    shape.holes.push(new THREE.Path(hp));
  }
  return shape;
}

function slabGeometry(b: CampusBuilding) {
  const g = new THREE.ExtrudeGeometry(footprintShape(b), { depth: SLAB, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Outer shell as one open tube (walls only), for the glass look. */
function shellGeometry(b: CampusBuilding, top: number) {
  const pos: number[] = [];
  const ringWalls = (r: number[]) => {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = r[i * 2], z0 = r[i * 2 + 1], x1 = r[j * 2], z1 = r[j * 2 + 1];
      pos.push(x0, 0, z0, x1, 0, z1, x1, top, z1, x0, 0, z0, x1, top, z1, x0, top, z0);
    }
  };
  ringWalls(b.outer);
  for (const h of b.holes) if (h.length >= 6) ringWalls(h);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Partition walls around every cell, as thin double-sided quads. */
function partitionGeometry(cells: Cell[]) {
  const pos: number[] = [];
  const seen = new Set<string>();
  for (const c of cells) {
    for (let i = 0; i < 4; i++) {
      const a = c.corners[i], b = c.corners[(i + 1) % 4];
      const key = [a, b].map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      // Leave a door gap on the hallway side (corners 2 -> 3).
      if (i === 2 && c.kind !== "stairs") {
        const t0 = 0.3, t1 = 0.62;
        const p0: [number, number] = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        const p1: [number, number] = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        for (const [u, v] of [[a, p0], [p1, b]] as [[number, number], [number, number]][]) {
          pos.push(u[0], 0, u[1], v[0], 0, v[1], v[0], WALL_H, v[1], u[0], 0, u[1], v[0], WALL_H, v[1], u[0], WALL_H, u[1]);
        }
        continue;
      }
      pos.push(a[0], 0, a[1], b[0], 0, b[1], b[0], WALL_H, b[1], a[0], 0, a[1], b[0], WALL_H, b[1], a[0], WALL_H, a[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The floor plan drawn on a canvas in world x,z: hallway, rooms, numbers, occupants. */
function planTexture(plan: FloorPlan, floor: number, occupants: Occupant[], focus: string | null) {
  const W = plan.xMax - plan.xMin, H = plan.zMax - plan.zMin;
  const ppm = Math.min(30, 2048 / Math.max(W, H));
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(W * ppm);
  cv.height = Math.ceil(H * ppm);
  const g = cv.getContext("2d")!;
  const X = (x: number) => (x - plan.xMin) * ppm;
  const Y = (z: number) => (z - plan.zMin) * ppm;
  const path = (r: number[]) => {
    g.beginPath();
    for (let i = 0; i < r.length; i += 2) (i ? g.lineTo(X(r[i]), Y(r[i + 1])) : g.moveTo(X(r[i]), Y(r[i + 1])));
    g.closePath();
  };

  // Hallway floor: the whole footprint, courtyards cut out.
  g.fillStyle = "#d3d6da";
  path(plan.outer);
  g.fill();
  g.globalCompositeOperation = "destination-out";
  for (const h of plan.holes) {
    path(h);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";

  const byCell = new Map<Cell, Occupant>();
  for (const o of occupants) if (o.floor === floor) byCell.set(o.cell, o);

  for (const c of plan.cells) {
    const occ = byCell.get(c);
    const isFocus = !!occ && occ.checkId === focus;
    g.fillStyle =
      isFocus ? "#ff3b30" :
      occ ? tint(STATUS_COLORS[occ.status]) :
      c.kind === "bath" ? "#b9d4e3" :
      c.kind === "stairs" ? "#e7d27a" :
      c.kind === "lounge" ? "#d9c9e8" : "#cfae84";
    g.beginPath();
    c.corners.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(60,50,40,0.55)";
    g.lineWidth = 1;
    g.stroke();

    // Text along the wall, kept upright.
    const [cx, cz] = c.center;
    let ang = c.angle;
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    const wPx = Math.hypot(c.corners[1][0] - c.corners[0][0], c.corners[1][1] - c.corners[0][1]) * ppm;
    g.save();
    g.translate(X(cx), Y(cz));
    g.rotate(ang);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (c.kind === "stairs") {
      // Stair treads.
      g.strokeStyle = "rgba(80,60,20,0.6)";
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(k * wPx * 0.11, -wPx * 0.4);
        g.lineTo(k * wPx * 0.11, wPx * 0.4);
        g.stroke();
      }
    }
    const text = c.kind === "room" ? occ?.room ?? roomLabel(plan, c, floor) : c.label;
    const size = c.kind === "room" ? Math.max(9, Math.min(wPx * 0.27, 22)) : Math.max(8, Math.min(wPx * 0.16, 13));
    g.font = `${isFocus ? "bold " : c.kind === "room" ? "600 " : ""}${size}px system-ui, sans-serif`;
    g.fillStyle = isFocus ? "#ffffff" : c.kind === "room" ? "#2b2622" : "#3d3a36";
    g.fillText(text, 0, 0);
    g.restore();
  }
  // Exterior and courtyard walls.
  g.strokeStyle = "#2f2b27";
  g.lineWidth = Math.max(2, ppm * 0.35);
  path(plan.outer);
  g.stroke();
  for (const h of plan.holes) {
    path(h);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, W, H };
}

/** A real published floor map, placed on the footprint, with occupants marked. */
function realTexture(plan: FloorPlan, floor: number, img: HTMLImageElement, occupants: Occupant[], focus: string | null) {
  const real = plan.real.get(floor)!;
  const W = plan.xMax - plan.xMin, H = plan.zMax - plan.zMin;
  const ppm = Math.min(30, 2048 / Math.max(W, H));
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(W * ppm);
  cv.height = Math.ceil(H * ppm);
  const g = cv.getContext("2d")!;
  const X = (x: number) => (x - plan.xMin) * ppm;
  const Y = (z: number) => (z - plan.zMin) * ppm;
  // Clip to the footprint so the map's margins and labels stay outside.
  g.save();
  g.beginPath();
  for (let i = 0; i < plan.outer.length; i += 2) (i ? g.lineTo(X(plan.outer[i]), Y(plan.outer[i + 1])) : g.moveTo(X(plan.outer[i]), Y(plan.outer[i + 1])));
  g.closePath();
  g.clip();
  g.fillStyle = "#f4f4f2";
  g.fillRect(0, 0, cv.width, cv.height);
  const P = realToScene(real.plan, plan.xMin, plan.xMax, plan.zMin, plan.zMax);
  const [ix0, iy0] = P(0, 0);
  const [ix1, iy1] = P(real.plan.size[0], real.plan.size[1]);
  g.drawImage(img, X(ix0), Y(iy0), X(ix1) - X(ix0), Y(iy1) - Y(iy0));
  g.restore();
  // Occupants: tint their room and print their name.
  for (const o of occupants) {
    if (o.floor !== floor) continue;
    const isFocus = o.checkId === focus;
    const [a, , b] = [o.cell.corners[0], o.cell.corners[1], o.cell.corners[2]];
    g.fillStyle = isFocus ? "rgba(255,59,48,0.85)" : `${STATUS_COLORS[o.status]}aa`;
    g.fillRect(X(a[0]), Y(a[1]), X(b[0]) - X(a[0]), Y(b[1]) - Y(a[1]));
    g.fillStyle = "#fff";
    g.font = `bold ${Math.max(10, ppm * 1.1)}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(o.room, X(o.cell.center[0]), Y(o.cell.center[1]));
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, W, H };
}

function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const im = new Image();
    im.onload = () => alive && setImg(im);
    im.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return src ? img : null;
}

function tint(hex: string) {
  const c = new THREE.Color(hex).lerp(new THREE.Color("#f3efe8"), 0.45);
  return `#${c.getHexString()}`;
}

export default function BuildingInterior({
  building,
  plan,
  floor,
  occupants,
  focusCheckId,
}: {
  building: CampusBuilding;
  plan: FloorPlan;
  floor: number;
  occupants: Occupant[];
  focusCheckId: string | null;
}) {
  const top = heightOf(building);
  const slab = useMemo(() => slabGeometry(building), [building]);
  const shell = useMemo(() => shellGeometry(building, top), [building, top]);
  const edges = useMemo(() => new THREE.EdgesGeometry(shell, 25), [shell]);
  const real = plan.real.get(floor) ?? null;
  const realImg = useImage(real ? real.plan.img : null);
  const cells = useMemo(() => cellsOn(plan, floor), [plan, floor]);
  const partitions = useMemo(() => partitionGeometry(cells), [cells]);
  const { tex, W, H } = useMemo(
    () => (real && realImg ? realTexture(plan, floor, realImg, occupants, focusCheckId) : planTexture(plan, floor, occupants, focusCheckId)),
    [plan, floor, occupants, focusCheckId, real, realImg],
  );

  const planeGeo = useMemo(() => new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), [W, H]);

  const center: [number, number] = [(plan.xMin + plan.xMax) / 2, (plan.zMin + plan.zMax) / 2];
  const y = floorY(floor);
  const here = occupants.filter((o) => o.floor === floor);
  const focus = occupants.find((o) => o.checkId === focusCheckId) ?? null;

  return (
    <group>
      {/* Floors below: solid slabs. */}
      {Array.from({ length: floor - 1 }, (_, i) => (
        <mesh key={i} geometry={slab} position-y={floorY(i + 1) - SLAB} castShadow receiveShadow>
          <meshStandardMaterial color="#d6d1c7" roughness={0.9} />
        </mesh>
      ))}
      {/* Viewed floor: slab, plan, partition walls. */}
      <mesh geometry={slab} position-y={y - SLAB} receiveShadow>
        <meshStandardMaterial color="#bdb7ac" roughness={0.9} />
      </mesh>
      <mesh geometry={planeGeo} position={[center[0], y + 0.03, center[1]]} renderOrder={2}>
        <meshBasicMaterial map={tex} transparent toneMapped={false} />
      </mesh>
      <mesh geometry={partitions} position-y={y}>
        <meshStandardMaterial color="#f7f4ef" emissive="#8d877f" emissiveIntensity={0.55} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      {/* Glass shell for the whole building, floors above included. */}
      <mesh geometry={shell} renderOrder={3}>
        <meshStandardMaterial color="#cfe3f2" transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} roughness={0.1} metalness={0.2} />
      </mesh>
      <lineSegments geometry={edges} renderOrder={4}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.75} />
      </lineSegments>
      {/* Floor lines on the glass so you can count storeys. */}
      {Array.from({ length: plan.floors - 1 }, (_, i) => (
        <lineSegments key={i} position-y={floorY(i + 2)} renderOrder={4}>
          <edgesGeometry args={[slab, 25]} />
          <lineBasicMaterial color="#ffffff" transparent opacity={i + 2 === floor ? 0 : 0.35} />
        </lineSegments>
      ))}
      {/* People on this floor. */}
      {here.map((o) => (
        <Person key={o.checkId} o={o} y={y} focus={o.checkId === focusCheckId} />
      ))}
      {focus && focus.floor === floor && <FocusGlow cell={focus.cell} y={y} />}
      {focus && (
        <Html position={[focus.cell.center[0], y + (focus.floor === floor ? 11 : top + 8), focus.cell.center[1]]} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
          <div className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs text-white shadow-xl ${focus.status === "urgent" ? "bg-red-900" : focus.status === "needs_help" ? "bg-red-600" : "bg-zinc-900/90"}`}>
            <div className="text-sm font-bold">{focus.name}</div>
            <div>
              Room {focus.room} · floor {focus.floor} of {plan.floors} · {STATUS_LABELS[focus.status]}
            </div>
          </div>
        </Html>
      )}
      <Html position={[center[0], top + 3, center[1]]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
          Floor {floor} of {plan.floors} · {real ? "real UCR floor map" : "estimated layout"}
        </div>
      </Html>
    </group>
  );
}

function Person({ o, y, focus }: { o: Occupant; y: number; focus: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current && focus) ref.current.position.y = y + 0.05 + Math.abs(Math.sin(clock.elapsedTime * 3)) * 0.35;
  });
  const color = STATUS_COLORS[o.status];
  const k = focus ? 1.35 : 1;
  return (
    <group ref={ref} position={[o.cell.center[0], y + 0.05, o.cell.center[1]]} scale={k}>
      <mesh position-y={0.85} castShadow>
        <capsuleGeometry args={[0.32, 0.9, 4, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={focus ? 0.7 : 0.25} toneMapped={false} />
      </mesh>
      <mesh position-y={1.75} castShadow>
        <sphereGeometry args={[0.26, 14, 10]} />
        <meshStandardMaterial color="#e2b48c" />
      </mesh>
    </group>
  );
}

function FocusGlow({ cell, y }: { cell: Cell; y: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const p = (clock.elapsedTime * 0.8) % 1;
    ref.current.scale.setScalar(1 + p * 5);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - p);
  });
  return (
    <mesh ref={ref} position={[cell.center[0], y + 0.12, cell.center[1]]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[1.6, 2, 40]} />
      <meshBasicMaterial color="#ff3b30" transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
