"use client";

// Owner: simulation
//
// The 3D UCR campus the demo plays out on. three.js touches `window`, so this
// file must only load in the browser: import it with next/dynamic and
// ssr: false (see app/sim/page.tsx).
//
// Two modes:
//  - Live: pass `students` (and `buildings`, `selectedIds`, `onToggle`) from
//    Convex, the same props as components/CampusMap.tsx. Pins update the
//    moment a check changes in the database.
//  - Demo: pass nothing. A built-in panel runs a fully simulated check-in so
//    the 3D campus can be shown on its own.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls, Sky } from "@react-three/drei";
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette, BrightnessContrast, HueSaturation } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status";
import { type CampusData, heightOf, loadCampus } from "./campusData";
import CampusWorld from "./CampusWorld";
import Environment, { SUN_DIR } from "./Environment";
import { BellTower, LANDMARK_MATCHERS } from "./Landmarks";
import {
  Responders,
  StudentPins,
  ZoneHighlight,
  pinPosition,
  useHallIndex,
  type SimResponder,
  type SimStudentDot,
} from "./StudentLayer";
import { useDemoIncident, type IncidentKind } from "./useDemoIncident";
import BuildingInterior, { type Occupant } from "./BuildingInterior";
import { cellForRoom, parseRoom, planBuilding } from "./floorPlan";

type BuildingRow = { _id: string; name: string; lat: number; lng: number };

export type CampusSimProps = {
  className?: string;
  /** "high" adds ambient occlusion; "low" for weak laptops (or ?q=low). */
  quality?: "high" | "low";
  // ---- live mode (all optional; omit `students` for the built-in demo) ----
  buildings?: BuildingRow[];
  students?: SimStudentDot[];
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  responders?: SimResponder[];
  /** Fly the camera to this student (e.g. when a row in the help queue is clicked). */
  focusCheckId?: string | null;
  /** Set to the incident's start time to play the earthquake shake once. */
  incidentStartedAt?: number | null;
};

// ---------- camera: smooth fly-to, interrupted by the user ----------

type Goal = { x: number; z: number; dist: number; y?: number; steep?: boolean } | null;
type Controls = {
  target: THREE.Vector3;
  update: () => void;
  addEventListener: (e: string, f: () => void) => void;
  removeEventListener: (e: string, f: () => void) => void;
};

function CameraRig({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const goalRef = useRef(goal);
  const doneRef = useRef(onDone);
  useEffect(() => {
    goalRef.current = goal;
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (!controls) return;
    const stop = () => doneRef.current();
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);
  useFrame((_, dt) => {
    const g = goalRef.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-dt * 2.2);
    const ty = g.y ?? 0;
    const tgt = new THREE.Vector3(g.x, ty, g.z);
    // Look from the south-west at `dist` metres; steeper when looking into a floor.
    const pos = g.steep
      ? new THREE.Vector3(g.x - g.dist * 0.16, ty + g.dist * 1.0, g.z + g.dist * 0.24)
      : new THREE.Vector3(g.x - g.dist * 0.55, ty + g.dist * 0.7, g.z + g.dist * 0.6);
    controls.target.lerp(tgt, k);
    camera.position.lerp(pos, k);
    controls.update();
    if (controls.target.distanceTo(tgt) < 0.5 && camera.position.distanceTo(pos) < 1) doneRef.current();
  });
  return null;
}

// ---------- earthquake: shake the world, send a ripple out from the zone ----------

function Quake({ startedAt, center, children }: { startedAt: number | null; center: [number, number] | null; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const ripple = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const age = startedAt ? (Date.now() - startedAt) / 1000 : 99;
    const amp = age < 3 ? (1 - age / 3) * 1.6 : 0;
    g.position.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp * 0.4, (Math.random() - 0.5) * amp);
    const r = ripple.current;
    if (r) {
      r.visible = age < 4;
      r.scale.setScalar(10 + age * 260);
      (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 * (1 - age / 4));
    }
  });
  return (
    <>
      <group ref={group}>{children}</group>
      {center && (
        <mesh ref={ripple} rotation-x={-Math.PI / 2} position={[center[0], 0.8, center[1]]} visible={false}>
          <ringGeometry args={[0.96, 1, 96]} />
          <meshBasicMaterial color="#ff6b3d" transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
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
    <Html position={[b.center[0], heightOf(b) + 6, b.center[1]]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div className="whitespace-nowrap rounded-md bg-zinc-900/85 px-2 py-1 text-xs font-medium text-white shadow">
        {label}
        {b.housing ? <span className="ml-1 text-zinc-400">· click to add to zone</span> : null}
      </div>
    </Html>
  );
}

function PostFX({ quality }: { quality: "high" | "low" }) {
  return (
    <EffectComposer multisampling={0}>
      {quality === "high" ? <N8AO halfRes aoRadius={9} distanceFalloff={1.2} intensity={2.6} quality="medium" color="#1c1a16" /> : <></>}
      <SMAA />
      <HueSaturation saturation={0.08} />
      <BrightnessContrast contrast={0.06} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.28} darkness={0.42} />
    </EffectComposer>
  );
}

// ---------- main ----------

const NO_HALLS = new Map<string, number[]>();
const EMPTY_DATA = { buildings: [] } as unknown as CampusData;

export default function CampusSim(props: CampusSimProps) {
  const { className, quality: qualityProp } = props;
  const live = props.students !== undefined;
  const [quality] = useState<"high" | "low">(() =>
    qualityProp ?? (typeof window !== "undefined" && /[?&]q=low/.test(window.location.search) ? "low" : "high"),
  );
  const [data, setData] = useState<CampusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [status, setStatus] = useState("Loading UCR campus...");
  const [goal, setGoal] = useState<Goal>(null);
  // Cutaway: which building is opened up, which floor, who is highlighted.
  const [inspect, setInspect] = useState<{ bid: number; floor: number; focus: string | null } | null>(null);

  // Demo-mode state.
  const demo = useDemoIncident();
  const [demoZone, setDemoZone] = useState<string[]>(["Aberdeen-Inverness", "Lothian", "Pentland Hills"]);
  const [kind, setKind] = useState<IncidentKind>("earthquake");

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

  const hallIndex = useHallIndex(data ?? EMPTY_DATA);
  const halls = data ? hallIndex : NO_HALLS;

  // Live mode: Convex rows know lat/lng and name; attach the name to each
  // student so its pin lands on the right hall.
  const nameByLatLng = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of props.buildings ?? []) m.set(`${b.lat.toFixed(5)},${b.lng.toFixed(5)}`, b.name);
    return m;
  }, [props.buildings]);
  const students: SimStudentDot[] = useMemo(() => {
    if (!live) return demo.students;
    return (props.students ?? []).map((s) => ({
      ...s,
      buildingName: s.buildingName ?? nameByLatLng.get(`${s.lat.toFixed(5)},${s.lng.toFixed(5)}`),
    }));
  }, [live, demo.students, props.students, nameByLatLng]);
  const responders = live ? props.responders ?? [] : demo.responders;

  // Zone: hall names that are selected.
  const zoneNames: string[] = useMemo(() => {
    if (!live) return demoZone;
    const ids = new Set(props.selectedIds ?? []);
    return (props.buildings ?? []).filter((b) => ids.has(b._id)).map((b) => b.name);
  }, [live, demoZone, props.selectedIds, props.buildings]);
  const zoneIdx = useMemo(() => zoneNames.flatMap((n) => halls.get(n) ?? []), [zoneNames, halls]);
  const zoneCenter = useMemo<[number, number] | null>(() => {
    if (!data || !zoneIdx.length) return null;
    let x = 0, z = 0;
    for (const i of zoneIdx) {
      x += data.buildings[i].center[0];
      z += data.buildings[i].center[1];
    }
    return [x / zoneIdx.length, z / zoneIdx.length];
  }, [data, zoneIdx]);
  const incidentActive = live ? students.length > 0 : demo.active;
  const quakeAt = live ? props.incidentStartedAt ?? null : demo.active && kind === "earthquake" ? demo.startedAt : null;

  const toggleHall = (bid: number) => {
    if (!data) return;
    const name = data.buildings[bid]?.housing;
    if (!name) return;
    if (live) {
      const row = (props.buildings ?? []).find((b) => b.name === name);
      if (row) props.onToggle?.(row._id);
    } else if (!demo.active) {
      setDemoZone((z) => (z.includes(name) ? z.filter((n) => n !== name) : [...z, name]));
    }
  };

  const targets = useMemo(() => {
    const m = new Map<string, { x: number; z: number; ground: number }>();
    if (!data) return m;
    for (const s of students) m.set(s.checkId, pinPosition(s, data, halls));
    return m;
  }, [students, data, halls]);

  const openStudent = (checkId: string) => {
    const t = targets.get(checkId) as ({ x: number; z: number; bid?: number } | undefined);
    const s = students.find((x) => x.checkId === checkId);
    if (!t || !data) return;
    if (t.bid != null && t.bid >= 0) {
      const b = data.buildings[t.bid];
      const plan = planBuilding(b, parseRoom(s?.room)?.wing ?? "");
      const { cell, floor } = cellForRoom(plan, s?.room);
      setInspect({ bid: t.bid, floor, focus: checkId });
      setGoal({ x: cell.center[0], z: cell.center[1], y: (floor - 1) * 3.4, dist: 85, steep: true });
    } else {
      setGoal({ x: t.x, z: t.z, dist: 140 });
    }
  };
  const flyToStudent = openStudent;
  const focus = props.focusCheckId;
  useEffect(() => {
    if (focus) openStudent(focus);
    // Only re-fly when the requested student changes, not when pins move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Double-click any building to look inside it.
  const inspectBuilding = (bid: number) => {
    if (!data) return;
    const b = data.buildings[bid];
    // Buildings with a real floor map open on that floor.
    const realFloors = [...planBuilding(b).real.keys()].sort((x, y) => x - y);
    setInspect({ bid, floor: realFloors[0] ?? 1, focus: null });
    setGoal({ x: b.center[0], z: b.center[1], y: 0, dist: Math.max(70, Math.sqrt(b.area) * 1.6), steep: true });
  };
  // ?inspect=Watkins%20Hall opens a building straight away (handy for demos).
  useEffect(() => {
    if (!data) return;
    const name = new URLSearchParams(window.location.search).get("inspect");
    if (!name) return;
    const bid = data.buildings.findIndex((b) => b.name === name || b.housing === name);
    if (bid >= 0) inspectBuilding(bid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInspect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The opened building: its plan and who's inside, room by room.
  const cutaway = useMemo(() => {
    if (!inspect || !data) return null;
    const b = data.buildings[inspect.bid];
    if (!b) return null;
    const focusStudent = students.find((x) => x.checkId === inspect.focus);
    const plan = planBuilding(b, parseRoom(focusStudent?.room)?.wing ?? parseRoom(students.find((x) => (targets.get(x.checkId) as { bid?: number } | undefined)?.bid === inspect.bid)?.room)?.wing ?? "");
    const occupants: Occupant[] = [];
    for (const st of students) {
      const t = targets.get(st.checkId) as { bid?: number } | undefined;
      if (t?.bid !== inspect.bid) continue;
      const { cell, floor } = cellForRoom(plan, st.room);
      occupants.push({ checkId: st.checkId, name: st.studentName, status: st.status, room: st.room ?? `${plan.wing}${floor}${cell.label}`, floor, cell, isReal: st.isReal });
    }
    return { b, plan, occupants };
  }, [inspect, data, students, targets]);
  // Starting a check-in flies to the zone.
  useEffect(() => {
    if (incidentActive && zoneCenter) setGoal({ x: zoneCenter[0], z: zoneCenter[1], dist: 520 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentActive]);

  const sun = useMemo(() => SUN_DIR.clone().multiplyScalar(1000).toArray() as [number, number, number], []);

  return (
    <div className={`relative overflow-hidden ${className ?? "h-full w-full"}`}>
      <Canvas
        shadows
        dpr={quality === "low" ? 1 : [1, 1.75]}
        camera={{ position: [-330, 300, 420], fov: 40, near: 2, far: 16000 }}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
        style={{ cursor: hover != null ? "pointer" : "grab" }}
      >
        <fog attach="fog" args={["#c9d6e2", 1800, 9000]} />
        <Sky sunPosition={sun} turbidity={4.5} rayleigh={0.9} mieCoefficient={0.005} mieDirectionalG={0.82} distance={20000} />
        <Quake startedAt={quakeAt} center={zoneCenter}>
          <Environment data={data} />
          {data && <CampusWorld data={data} hide={landmarks.hide} xray={inspect?.bid ?? null} onHover={setHover} onPick={toggleHall} onInspect={inspectBuilding} />}
          {landmarks.bell && <BellTower x={landmarks.bell[0]} z={landmarks.bell[1]} />}
        </Quake>
        {data && <ZoneHighlight data={data} indices={zoneIdx} active={incidentActive} />}
        {data && <StudentPins data={data} students={students} halls={halls} onPick={flyToStudent} hideBid={inspect?.bid ?? null} />}
        {cutaway && inspect && (
          <BuildingInterior building={cutaway.b} plan={cutaway.plan} floor={Math.min(inspect.floor, cutaway.plan.floors)} occupants={cutaway.occupants} focusCheckId={inspect.focus} />
        )}
        {data && <Responders responders={responders} targets={targets} />}
        {data && <HoverLabel data={data} bid={hover} />}
        <MapControls makeDefault target={[180, 0, -180]} maxPolarAngle={Math.PI / 2.15} minDistance={30} maxDistance={4200} enableDamping dampingFactor={0.08} />
        <CameraRig goal={goal} onDone={() => setGoal(null)} />
        <PostFX quality={quality} />
      </Canvas>

      {!data && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-zinc-900/80 px-4 py-2 text-sm text-white">{error ? `Could not load campus: ${error}` : status}</div>
        </div>
      )}

      {data && !live && (
        <DemoPanel zone={demoZone} kind={kind} setKind={setKind} demo={demo} onFly={flyToStudent} onHome={() => setGoal({ x: 180, z: -180, dist: 640 })} />
      )}
      {cutaway && inspect && (
        <InspectPanel
          title={cutaway.b.housing ?? (cutaway.b.name || "Building")}
          subtitle={cutaway.b.housing && cutaway.b.name && cutaway.b.name !== cutaway.b.housing ? cutaway.b.name : undefined}
          floor={Math.min(inspect.floor, cutaway.plan.floors)}
          floors={cutaway.plan.floors}
          rooms={cutaway.plan.cells.filter((c) => c.kind === "room").length}
          occupants={cutaway.occupants}
          focus={inspect.focus}
          onFloor={(f) => setInspect((i) => (i ? { ...i, floor: f } : i))}
          onPick={(id) => {
            const o = cutaway.occupants.find((x) => x.checkId === id);
            if (!o) return;
            setInspect((i) => (i ? { ...i, floor: o.floor, focus: id } : i));
            setGoal({ x: o.cell.center[0], z: o.cell.center[1], y: (o.floor - 1) * 3.4, dist: 85, steep: true });
          }}
          onClose={() => setInspect(null)}
        />
      )}
      {data && !inspect && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-zinc-900/70 px-2.5 py-1.5 text-[11px] text-zinc-200">
          Double-click any building to look inside
        </div>
      )}
      <Legend />
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-zinc-800/80">Map data © OpenStreetMap contributors</div>
    </div>
  );
}

// ---------- overlay UI ----------

function Legend() {
  const items: [string, string][] = [
    [STATUS_COLORS.pending, "Pending / no answer"],
    [STATUS_COLORS.safe, "Safe"],
    [STATUS_COLORS.needs_help, "Needs help"],
    [STATUS_COLORS.urgent, "Urgent"],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/85 px-3 py-2 text-xs text-zinc-800 shadow backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {items.map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {l}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-zinc-500" /> Simulated
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" /> Responder
        </span>
      </div>
    </div>
  );
}

function DemoPanel({
  zone,
  kind,
  setKind,
  demo,
  onFly,
  onHome,
}: {
  zone: string[];
  kind: IncidentKind;
  setKind: (k: IncidentKind) => void;
  demo: ReturnType<typeof useDemoIncident>;
  onFly: (checkId: string) => void;
  onHome: () => void;
}) {
  const s = demo.students;
  const count = (st: string) => s.filter((x) => x.status === st).length;
  const rank = (st: string) => (st === "urgent" ? 0 : 1);
  const help = s.filter((x) => x.status === "urgent" || x.status === "needs_help").sort((a, b) => rank(a.status) - rank(b.status));
  const resolved = s.length - count("pending") - count("calling");
  const tiles: [string, number, string][] = [
    ["Safe", count("safe"), "text-green-400"],
    ["Help", count("needs_help"), "text-red-400"],
    ["Urgent", count("urgent"), "text-red-300"],
    ["No ans.", count("no_answer"), "text-zinc-400"],
  ];
  return (
    <div className="absolute left-3 top-3 flex max-h-[calc(100%-5rem)] w-80 flex-col gap-3 overflow-hidden rounded-xl bg-zinc-950/85 p-4 text-sm text-zinc-100 shadow-2xl backdrop-blur">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-base font-semibold">Bear Call · UCR</div>
          <div className="text-[11px] text-zinc-400">Offline demo · every student here is simulated</div>
        </div>
        <button onClick={onHome} className="rounded bg-zinc-800 px-2 py-1 text-[11px] hover:bg-zinc-700">
          Overview
        </button>
      </div>

      {!demo.active ? (
        <>
          <div className="text-xs text-zinc-300">Click residence halls in 3D to set the zone.</div>
          <div className="flex flex-wrap gap-1">
            {zone.length ? (
              zone.map((z) => (
                <span key={z} className="rounded bg-blue-600/80 px-2 py-0.5 text-[11px]">
                  {z}
                </span>
              ))
            ) : (
              <span className="text-xs text-zinc-500">No halls selected</span>
            )}
          </div>
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)} className="flex-1 rounded-md bg-zinc-800 px-2 py-2 text-sm">
              <option value="earthquake">Earthquake</option>
              <option value="outage">Power outage</option>
              <option value="evacuation">Evacuation</option>
              <option value="air_quality">Air quality</option>
            </select>
            <button disabled={!zone.length} onClick={() => demo.start(zone, kind)} className="rounded-md bg-red-600 px-3 py-2 font-semibold hover:bg-red-500 disabled:bg-zinc-700">
              Start Roll Call
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1 text-center">
            {tiles.map(([l, n, c]) => (
              <div key={l} className="rounded-md bg-zinc-900 py-1.5">
                <div className={`text-lg font-bold ${c}`}>{n}</div>
                <div className="text-[10px] text-zinc-400">{l}</div>
              </div>
            ))}
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${s.length ? (resolved / s.length) * 100 : 0}%` }} />
          </div>
          <div className="text-[11px] text-zinc-400">
            {resolved} of {s.length} students resolved
          </div>
          {help.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold text-red-300">Needs help · click to fly there</div>
              {help.map((h) => {
                const r = demo.responders.find((x) => x.toCheckId === h.checkId);
                return (
                  <button key={h.checkId} onClick={() => onFly(h.checkId)} className="flex items-center justify-between rounded-md bg-zinc-900 px-2 py-1.5 text-left hover:bg-zinc-800">
                    <span>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[h.status] }} /> {h.studentName}
                      <span className="text-zinc-400"> · {h.buildingName}</span>
                    </span>
                    <span className="text-[10px] text-blue-300">
                      {r ? (r.status === "arrived" ? "on scene" : r.status === "offered" ? "offering" : `${r.name.split(" ")[0]} en route`) : STATUS_LABELS[h.status]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-black/30 p-2 font-mono text-[10.5px] leading-snug">
            {demo.feed.map((f, i) => (
              <div
                key={i}
                className={
                  f.tone === "safe" ? "text-green-300" : f.tone === "help" ? "text-red-300" : f.tone === "urgent" ? "text-red-400" : f.tone === "grey" ? "text-zinc-500" : "text-zinc-300"
                }
              >
                {new Date(f.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} {f.text}
              </div>
            ))}
          </div>
          <button onClick={demo.reset} className="rounded-md bg-zinc-800 py-2 text-xs hover:bg-zinc-700">
            End and reset
          </button>
        </>
      )}
    </div>
  );
}

function InspectPanel({
  title,
  subtitle,
  floor,
  floors,
  rooms,
  occupants,
  focus,
  onFloor,
  onPick,
  onClose,
}: {
  title: string;
  subtitle?: string;
  floor: number;
  floors: number;
  rooms: number;
  occupants: Occupant[];
  focus: string | null;
  onFloor: (f: number) => void;
  onPick: (checkId: string) => void;
  onClose: () => void;
}) {
  const focused = occupants.find((o) => o.checkId === focus);
  const rank = (s: string) => (s === "urgent" ? 0 : s === "needs_help" ? 1 : s === "calling" || s === "pending" ? 2 : s === "no_answer" ? 3 : 4);
  const list = [...occupants].sort((a, b) => rank(a.status) - rank(b.status) || a.floor - b.floor);
  return (
    <div className="absolute right-3 top-3 flex max-h-[calc(100%-5rem)] w-72 flex-col gap-3 rounded-xl bg-zinc-950/88 p-4 text-sm text-zinc-100 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">Inside view</div>
          <div className="text-base font-semibold leading-tight">{title}</div>
          {subtitle ? <div className="text-xs text-zinc-400">{subtitle}</div> : null}
        </div>
        <button onClick={onClose} className="rounded bg-zinc-800 px-2 py-1 text-[11px] hover:bg-zinc-700">
          Exit (Esc)
        </button>
      </div>
      {focused && (
        <div className={`rounded-lg p-2.5 ${focused.status === "urgent" ? "bg-red-900/80" : focused.status === "needs_help" ? "bg-red-600/80" : "bg-zinc-800"}`}>
          <div className="font-semibold">{focused.name}</div>
          <div className="text-xs opacity-90">
            Room {focused.room} · floor {focused.floor} · {STATUS_LABELS[focused.status]}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button disabled={floor <= 1} onClick={() => onFloor(floor - 1)} className="rounded bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700 disabled:opacity-30">
          ▼
        </button>
        <div className="flex-1 text-center">
          <div className="text-lg font-bold">Floor {floor}</div>
          <div className="text-[10px] text-zinc-400">
            of {floors} · {rooms} rooms per floor
          </div>
        </div>
        <button disabled={floor >= floors} onClick={() => onFloor(floor + 1)} className="rounded bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700 disabled:opacity-30">
          ▲
        </button>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: floors }, (_, i) => i + 1).map((f) => {
          const bad = occupants.some((o) => o.floor === f && (o.status === "needs_help" || o.status === "urgent"));
          return (
            <button key={f} onClick={() => onFloor(f)} className={`flex-1 rounded py-1 text-xs ${f === floor ? "bg-white text-zinc-900" : bad ? "bg-red-700" : "bg-zinc-800 hover:bg-zinc-700"}`}>
              {f}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-1 text-xs font-semibold text-zinc-300">People in this building ({occupants.length})</div>
        {list.length === 0 && <div className="text-xs text-zinc-500">No one checked in here for this incident.</div>}
        {list.map((o) => (
          <button key={o.checkId} onClick={() => onPick(o.checkId)} className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-zinc-800 ${o.checkId === focus ? "bg-zinc-800" : ""}`}>
            <span>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[o.status] }} />
              {o.name}
            </span>
            <span className="text-zinc-400">
              {o.room} · F{o.floor}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
