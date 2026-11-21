"use client";

// Responder page, opened on a phone from the offer link. Owner: frontend.
import { useParams } from "next/navigation";
import OfferCard, { type Offer } from "@/components/OfferCard";

export default function ResponderPage() {
  const { token } = useParams<{ token: string }>();

  // TODO const offer = useQuery(api.assignments.byToken, { token });
  //      undefined = loading, null = no offer for this token.
  const offer = undefined as Offer | null | undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Bear Call</h1>

      {offer === undefined && (
        <p className="text-sm text-zinc-500">Loading offer {token}...</p>
      )}
      {offer === null && (
        <p className="text-sm text-zinc-500">This offer link is not valid.</p>
      )}
      {offer && (
        // TODO onAccept: useMutation(api.assignments.accept) with { token }.
        //      If it returns ok: false, show "Another responder took this one."
        <OfferCard offer={offer} onAccept={() => {}} />
      )}
    </main>
  );
}
