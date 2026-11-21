"use client";

import { useCountdown } from "@/lib/useCountdown";

// What the responder page needs from api.assignments.byToken (not written yet).
export type Offer = {
  status: "proposed" | "offered" | "accepted" | "expired";
  studentName: string;
  buildingName: string;
  room: string;
  need: string;
  distanceMeters: number;
  etaMinutes: number;
  offerExpiresAt?: number;
};

export default function OfferCard({
  offer,
  onAccept,
}: {
  offer: Offer;
  onAccept: () => void;
}) {
  const secondsLeft = useCountdown(offer.offerExpiresAt);
  const expired = offer.status === "expired" || secondsLeft === 0;

  if (offer.status === "accepted") {
    return (
      <p className="rounded-lg bg-green-50 p-4 text-lg font-medium text-green-800">
        You&apos;re confirmed. Go to {offer.buildingName}, room {offer.room}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4">
      <div>
        <p className="text-xl font-semibold">{offer.studentName}</p>
        <p className="text-zinc-600">
          {offer.buildingName}, room {offer.room}
        </p>
      </div>

      <p>{offer.need}</p>

      <p className="text-sm text-zinc-500">
        {Math.round(offer.distanceMeters)} m away, about {offer.etaMinutes} min
        walk
      </p>

      <button
        onClick={onAccept}
        disabled={expired}
        className="rounded-lg bg-green-600 py-4 text-lg font-semibold text-white disabled:bg-zinc-300"
      >
        {expired
          ? "Offer expired"
          : secondsLeft === null
            ? "Accept"
            : `Accept (${secondsLeft}s)`}
      </button>
    </div>
  );
}
