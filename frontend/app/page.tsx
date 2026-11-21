"use client";

// Dispatcher dashboard. Owner: frontend.
import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rollcall/backend/convex/_generated/api";
import type { Id } from "@rollcall/backend/convex/_generated/dataModel";
import CounterBar from "@/components/CounterBar";
import HelpQueue from "@/components/HelpQueue";
import HonestyCounter from "@/components/HonestyCounter";
import LiveFeed from "@/components/LiveFeed";
import { INCIDENT_LABELS, type IncidentType } from "@/lib/incident";
import { useWalkingResponders } from "@/lib/useWalkingResponders";

// The 3D campus from /sim, in live mode: it takes the same Convex rows the
// flat Leaflet map (components/CampusMap.tsx) took. three.js needs `window`,
// so it only loads in the browser.
const CampusSim = dynamic(() => import("@/components/simulation/CampusSim"), {
  ssr: false,
  loading: () => (
    <div className="h-[560px] w-full animate-pulse rounded-lg bg-zinc-100" />
  ),
});

export default function Dashboard() {
  // Every useQuery is a live subscription: the page re-renders when the data
  // behind it changes, so there is no refresh button anywhere.
  const buildings = useQuery(api.buildings.list);
  const incident = useQuery(api.incidents.current);

  // The rest only make sense while an incident is running.
  const forIncident = incident ? { incidentId: incident._id } : "skip";
  const students = useQuery(api.checks.listForIncident, forIncident);
  const counts = useQuery(api.checks.counters, forIncident);
  const queue = useQuery(api.assignments.queue, forIncident);
  const call = useQuery(api.checks.currentCall, forIncident);
  const honesty = useQuery(api.checks.honesty, forIncident);
  const responders = useWalkingResponders(incident?._id);

  const startIncident = useMutation(api.incidents.start);
  const closeIncident = useMutation(api.incidents.close);
  const approve = useMutation(api.assignments.approve);
  const markManual = useMutation(api.checks.markManual);

  // The zone: buildings the dispatcher has clicked on the map.
  const [selectedIds, setSelectedIds] = useState<Id<"buildings">[]>([]);
  const [incidentType, setIncidentType] = useState<IncidentType>("earthquake");
  const [error, setError] = useState<string | null>(null);

  function toggleBuilding(id: Id<"buildings">) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  async function handleStart() {
    setError(null);
    try {
      await startIncident({ type: incidentType, buildingIds: selectedIds });
      setSelectedIds([]);
    } catch {
      setError("Could not start the roll call. Is one already running?");
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Bear Call</h1>

        {incident ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-600">
              {INCIDENT_LABELS[incident.type]} · started{" "}
              {new Date(incident.startedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
              {counts ? ` · ${counts.total} students` : ""}
            </span>
            <button
              onClick={() => closeIncident({ incidentId: incident._id })}
              className="whitespace-nowrap rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium"
            >
              End incident
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-500">
              {selectedIds.length === 0
                ? "Click halls on the map to pick the zone"
                : `${selectedIds.length} ${selectedIds.length === 1 ? "hall" : "halls"} selected`}
            </span>
            <select
              aria-label="Incident type"
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value as IncidentType)}
              className="rounded-md border border-zinc-300 px-2 py-2 text-sm"
            >
              {Object.entries(INCIDENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={handleStart}
              disabled={selectedIds.length === 0 || incident === undefined}
              className="whitespace-nowrap rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Start Roll Call
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {buildings === undefined && (
        <p className="text-sm text-zinc-500">Connecting to Convex...</p>
      )}

      <CounterBar
        counts={counts ?? { accountedFor: 0, needsHelp: 0, urgent: 0, noAnswer: 0 }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CampusSim
            className="h-[560px] w-full rounded-lg"
            buildings={buildings ?? []}
            students={students ?? []}
            // While an incident runs the zone is fixed to its buildings.
            selectedIds={incident ? incident.buildingIds : selectedIds}
            onToggle={
              incident
                ? () => {}
                : (id) => toggleBuilding(id as Id<"buildings">)
            }
            // Plays the shake once, right as an earthquake roll call starts.
            incidentStartedAt={
              incident?.type === "earthquake" ? incident.startedAt : null
            }
            // Offered responders stand at their post; accepted ones walk to
            // their student.
            responders={responders}
          />
        </div>

        <div className="flex flex-col gap-4">
          <HelpQueue
            items={queue ?? []}
            onApprove={(assignmentId) => approve({ assignmentId })}
          />
          <LiveFeed
            call={call ?? null}
            onMarkNeedsHelp={(checkId) => markManual({ checkId })}
          />
          <HonestyCounter
            flagged={honesty?.flagged ?? 0}
            calls={honesty?.calls ?? 0}
          />
        </div>
      </div>
    </main>
  );
}
