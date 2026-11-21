"use client";

// Dispatcher dashboard. Owner: frontend.
import { useQuery } from "convex/react";
import { api } from "@rollcall/backend/convex/_generated/api";

export default function Dashboard() {
  // Live subscription: re-renders whenever the buildings table changes.
  const buildings = useQuery(api.buildings.list);

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Roll Call</h1>

      <p className="text-sm text-zinc-500">
        {buildings === undefined
          ? "Connecting to Convex..."
          : `Connected. ${buildings.length} buildings loaded.`}
      </p>

      {/* TODO counter bar: accounted for / need help / urgent / no answer */}
      {/* TODO Start Roll Call button: incident type + selected buildings */}
      {/* TODO map: Leaflet, one dot per student. Load it with next/dynamic
          and ssr: false, or the build fails on `window`. */}
      {/* TODO help queue: urgent first, with Approve */}
      {/* TODO live feed: transcript + extracted answers, manual override */}
      {/* TODO honesty counter */}
    </main>
  );
}
