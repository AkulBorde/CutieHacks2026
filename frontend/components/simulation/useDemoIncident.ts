"use client";

// Owner: simulation
//
// An offline stand-in for the backend, so the 3D campus can run a full
// check-in on its own (no Convex, no phones): it uses the same roster and the
// same simulated outcome mix as backend/convex/simulator.ts, then dispatches
// the nearest responder to anyone who needs help. Everything here is
// labelled simulated on screen.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SIM_HALLS,
  SIM_RESPONDERS,
  allSimStudents,
  simulatedDelayMs,
  simulatedOutcome,
} from "@rollcall/backend/convex/lib/simData";
import type { CheckStatus, SimResponder, SimStudentDot } from "./StudentLayer";

export type IncidentKind = "earthquake" | "outage" | "evacuation" | "air_quality";
export type FeedLine = { t: number; text: string; tone: "info" | "safe" | "help" | "urgent" | "grey" };

// Same formula as backend/convex/lib/geo.ts: walking pace 80 m/min, +1, min 2.
function distanceMeters(a: [number, number], b: [number, number]) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const etaMinutes = (m: number) => Math.max(2, Math.ceil(m / 80) + 1);

const ROSTER = (() => {
  const all = allSimStudents();
  return all.map((s, i) => {
    const hall = SIM_HALLS.find((h) => h.name === s.hall)!;
    return { id: `demo-${i}`, ...s, lat: hall.lat, lng: hall.lng };
  });
})();

export function useDemoIncident(speed = 0.55) {
  const [students, setStudents] = useState<SimStudentDot[]>([]);
  const [responders, setResponders] = useState<SimResponder[]>([]);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [active, setActive] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef(new Set<string>());

  const log = useCallback((text: string, tone: FeedLine["tone"] = "info") => {
    setFeed((f) => [{ t: Date.now(), text, tone }, ...f].slice(0, 60));
  }, []);

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    busy.current.clear();
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const reset = useCallback(() => {
    clear();
    setStudents([]);
    setResponders([]);
    setFeed([]);
    setActive(false);
    setStartedAt(null);
  }, [clear]);

  const dispatch = useCallback(
    (s: SimStudentDot) => {
      // Nearest responder who isn't already out.
      const free = SIM_RESPONDERS.filter((r) => !busy.current.has(r.name));
      if (!free.length) {
        log(`No free responder for ${s.studentName}. Queued.`, "grey");
        return;
      }
      const best = free
        .map((r) => ({ r, d: distanceMeters([r.lat, r.lng], [s.lat, s.lng]) }))
        .sort((a, b) => a.d - b.d)[0];
      busy.current.add(best.r.name);
      const eta = etaMinutes(best.d);
      const id = `${best.r.name}-${s.checkId}`;
      setResponders((rs) => [
        ...rs,
        { id, name: best.r.name, role: best.r.role, from: [best.r.lat, best.r.lng], toCheckId: s.checkId, status: "offered", etaMinutes: eta, progress: 0 },
      ]);
      log(`Offer sent to ${best.r.name} (${best.r.role}), ${Math.round(best.d)} m away.`, "info");
      later(2500, () => {
        setResponders((rs) => rs.map((r) => (r.id === id ? { ...r, status: "accepted" } : r)));
        log(`${best.r.name} accepted. Callback: "${best.r.name} is on the way, about ${eta} minutes."`, "safe");
        // Walk, time-compressed so the demo doesn't take real minutes.
        const walkMs = 9000 + eta * 1200;
        const t0 = performance.now();
        const step = () => {
          const p = (performance.now() - t0) / walkMs;
          setResponders((rs) => rs.map((r) => (r.id === id ? { ...r, progress: Math.min(1, p), status: p >= 1 ? "arrived" : r.status } : r)));
          if (p < 1) timers.current.push(window.setTimeout(step, 50));
          else log(`${best.r.name} is with ${s.studentName}.`, "safe");
        };
        step();
      });
    },
    [log],
  );

  const start = useCallback(
    (hallNames: string[], kind: IncidentKind) => {
      clear();
      const inZone = ROSTER.filter((s) => hallNames.includes(s.hall));
      const dots: SimStudentDot[] = inZone.map((s) => ({
        checkId: s.id,
        studentName: s.name,
        status: "pending",
        isReal: false,
        lat: s.lat,
        lng: s.lng,
        buildingName: s.hall,
        room: s.room,
      }));
      setStudents(dots);
      setResponders([]);
      setFeed([]);
      setActive(true);
      setStartedAt(Date.now());
      const label = kind.replace("_", " ");
      log(`Roll Call started: ${label} affecting ${hallNames.join(", ")}. Calling ${dots.length} students.`, "info");

      const set = (id: string, status: CheckStatus) =>
        setStudents((list) => list.map((d) => (d.checkId === id ? { ...d, status } : d)));

      for (const d of dots) {
        later(300 + (simulatedDelayMs(d.checkId) % 1800), () => set(d.checkId, "calling"));
        later(1500 + simulatedDelayMs(d.checkId) * speed, () => {
          const outcome = simulatedOutcome(d.checkId);
          set(d.checkId, outcome);
          const who = `${d.studentName} (${d.buildingName} ${d.room})`;
          if (outcome === "safe") log(`${who}: safe.`, "safe");
          else if (outcome === "no_answer") log(`${who}: no answer. Flagged for an in-person check.`, "grey");
          else {
            log(`${who}: ${outcome === "urgent" ? "URGENT. Told to call 911 now." : "needs help getting out."}`, outcome === "urgent" ? "urgent" : "help");
            later(1800, () => dispatch({ ...d, status: outcome }));
          }
        });
      }
    },
    [clear, dispatch, log, speed],
  );

  useEffect(() => clear, [clear]);

  return { students, responders, feed, active, startedAt, start, reset };
}
