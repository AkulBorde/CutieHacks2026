"use client";

// Responder page, opened on a phone from the offer link. Owner: frontend.
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@rollcall/backend/convex/_generated/api";
import OfferCard from "@/components/OfferCard";

export default function ResponderPage() {
  const { token } = useParams<{ token: string }>();

  // undefined = loading, null = no live offer for this token.
  const offer = useQuery(api.assignments.byToken, { token });
  const accept = useMutation(api.assignments.accept);
  const [lost, setLost] = useState(false);

  async function handleAccept() {
    const result = await accept({ token });
    // The server decides who wins. If it says no, believe it.
    if (!result.ok) setLost(true);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Bear Call</h1>

      {offer === undefined && (
        <p className="text-sm text-zinc-500">Loading offer...</p>
      )}
      {offer === null && (
        <p className="text-sm text-zinc-500">This offer link is not valid.</p>
      )}
      {offer && lost && offer.status !== "accepted" && (
        <p className="rounded-lg bg-zinc-100 p-4 text-zinc-700">
          This offer is no longer open. Another responder took it, or it ran out.
        </p>
      )}
      {offer && !(lost && offer.status !== "accepted") && (
        <OfferCard offer={offer} onAccept={handleAccept} />
      )}
    </main>
  );
}
