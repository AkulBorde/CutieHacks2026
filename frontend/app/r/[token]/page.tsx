"use client";

// Responder page, opened on a phone from the offer link. Owner: frontend.
import { useParams } from "next/navigation";

export default function ResponderPage() {
  const { token } = useParams<{ token: string }>();

  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Roll Call</h1>
      <p className="text-sm text-zinc-500">Offer token: {token}</p>

      {/* TODO useQuery(api.assignments.byToken, { token }) */}
      {/* TODO card: student name, building + room, need, distance */}
      {/* TODO big Accept button with countdown -> api.assignments.accept */}
      {/* TODO after tap: "You're confirmed..." or "Another responder took this one." */}
    </main>
  );
}
