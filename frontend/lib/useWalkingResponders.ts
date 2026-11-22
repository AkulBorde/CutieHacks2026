import { useEffect, useMemo, useState } from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import { api } from "@rollcall/backend/convex/_generated/api";
import type { Id } from "@rollcall/backend/convex/_generated/dataModel";
import type { SimResponder } from "@/components/simulation/StudentLayer";

// One row of api.assignments.responders.
type ResponderRow = {
  assignmentId: string;
  checkId: string;
  name: string;
  role: string;
  lat: number;
  lng: number;
  status: "offered" | "accepted";
  etaMinutes: number;
  acceptedAt?: number;
};

const TICK_MS = 500;

// The responders the 3D campus draws for a running incident: offered ones
// stand at their post, accepted ones walk to their student.
//
// Nobody's phone shares a position, so how far along the walk someone is gets
// worked out from when they accepted and their ETA. It is an estimate, and
// each one is marked `estimated` so the map says so.
export function useWalkingResponders(
  incidentId: Id<"incidents"> | undefined,
): SimResponder[] {
  // useQueries hands back an Error instead of throwing, unlike useQuery. The
  // site can be pointed at a Convex deployment that doesn't have this query
  // yet; then the map shows no responders instead of the page crashing.
  const queries = useMemo(() => {
    const q: RequestForQueries = {};
    if (incidentId) {
      q.rows = { query: api.assignments.responders, args: { incidentId } };
    }
    return q;
  }, [incidentId]);
  const result = useQueries(queries).rows as ResponderRow[] | Error | undefined;
  const failed = result instanceof Error;
  const rows = failed ? undefined : result;

  useEffect(() => {
    if (failed) {
      console.warn(
        "assignments.responders failed, so no responders are drawn. Has the backend been deployed?",
      );
    }
  }, [failed]);

  const [now, setNow] = useState<number | null>(null);
  // Only tick while someone is actually walking.
  const walking = rows?.some((r) => r.status === "accepted") ?? false;

  useEffect(() => {
    if (!walking) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [walking]);

  return useMemo(
    () =>
      (rows ?? []).map((r) => {
        const walked =
          r.status === "accepted" && r.acceptedAt && now !== null
            ? (now - r.acceptedAt) / (r.etaMinutes * 60_000)
            : 0;
        return {
          id: r.assignmentId,
          name: r.name,
          role: r.role,
          from: [r.lat, r.lng] as [number, number],
          toCheckId: r.checkId,
          status: r.status,
          etaMinutes: r.etaMinutes,
          progress: Math.min(1, Math.max(0, walked)),
          estimated: true,
        };
      }),
    [rows, now],
  );
}
