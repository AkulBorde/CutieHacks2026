"use client";

// Dispatcher dashboard. Owner: frontend.
import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@rollcall/backend/convex/_generated/api";
import type { Id } from "@rollcall/backend/convex/_generated/dataModel";
import CounterBar from "@/components/CounterBar";
import HelpQueue from "@/components/HelpQueue";
import Legend from "@/components/Legend";
import LiveFeed from "@/components/LiveFeed";

const CampusMap = dynamic(() => import("@/components/CampusMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[480px] w-full animate-pulse rounded-lg bg-zinc-100" />
  ),
});

export default function Dashboard() {
  // Live subscription: re-renders whenever the buildings table changes.
  const buildings = useQuery(api.buildings.list);

  // The zone: buildings the dispatcher has clicked on the map.
  const [selectedIds, setSelectedIds] = useState<Id<"buildings">[]>([]);

  function toggleBuilding(id: Id<"buildings">) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Bear Call</h1>

        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">
            {selectedIds.length === 0
              ? "Click halls on the map to pick the zone"
              : `${selectedIds.length} ${selectedIds.length === 1 ? "hall" : "halls"} selected`}
          </span>
          {/* TODO onClick: useMutation(api.incidents.start) with selectedIds */}
          <button
            disabled={selectedIds.length === 0}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            Start Roll Call
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        {buildings === undefined
          ? "Connecting to Convex..."
          : `Connected. ${buildings.length} buildings loaded.`}
      </p>

      {/* TODO replace the zeros with useQuery(api.checks.counters) */}
      <CounterBar
        counts={{ accountedFor: 0, needsHelp: 0, urgent: 0, noAnswer: 0 }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <CampusMap
            buildings={buildings ?? []}
            selectedIds={selectedIds}
            onToggle={toggleBuilding}
          />
          <Legend />
        </div>

        <div className="flex flex-col gap-4">
          {/* TODO items: useQuery(api.assignments.queue), urgent first.
              onApprove: useMutation(api.assignments.approve) */}
          <HelpQueue items={[]} onApprove={() => {}} />

          {/* TODO call: the check being called right now.
              onMarkNeedsHelp: useMutation(api.checks.markManual) */}
          <LiveFeed call={null} onMarkNeedsHelp={() => {}} />
        </div>
      </div>

      {/* TODO honesty counter */}
    </main>
  );
}
