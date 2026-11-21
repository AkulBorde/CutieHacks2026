"use client";

// Owner: simulation. Standalone page for the 3D UCR campus: localhost:3000/sim
import dynamic from "next/dynamic";

const CampusSim = dynamic(() => import("@/components/simulation/CampusSim"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-400">
      Loading UCR campus...
    </div>
  ),
});

export default function SimPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-zinc-900">
      <CampusSim className="h-full w-full" />
    </main>
  );
}
