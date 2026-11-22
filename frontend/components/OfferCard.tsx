"use client";

import dynamic from "next/dynamic";
import { useCountdown } from "@/lib/useCountdown";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] min-h-[320px] w-full animate-pulse rounded-lg bg-zinc-100" />
  ),
});

// What api.assignments.byToken returns for a live offer.
export type Offer = {
  status: "proposed" | "offered" | "accepted" | "expired";
  // The responder has said they are done. Missing from a backend that has
  // not been redeployed yet.
  completed?: boolean;
  checkId: string;
  studentName: string;
  // Where the student said they are, or their dorm room. No room if they
  // only named a building.
  buildingName: string;
  room?: string;
  // Their own words, when they named a place that could not be matched to a
  // building. The building above is only their dorm then.
  unmatchedLocation?: string;
  need: string;
  distanceMeters: number;
  etaMinutes: number;
  offerExpiresAt?: number;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
};

export default function OfferCard({
  offer,
  onAccept,
  onDone,
  doneError,
}: {
  offer: Offer;
  onAccept: () => void;
  onDone: () => void;
  // Set when marking done failed, so the responder knows to try again.
  doneError: boolean;
}) {
  const secondsLeft = useCountdown(offer.offerExpiresAt);
  const expired = offer.status === "expired" || secondsLeft === 0;
  const place = offer.room
    ? `${offer.buildingName}, room ${offer.room}`
    : offer.buildingName;
  const unmatched = offer.unmatchedLocation && (
    <p className="text-sm font-medium text-amber-700">
      They said &ldquo;{offer.unmatchedLocation}&rdquo;, which is not a building
      we know. This is their dorm room, so they may not be there.
    </p>
  );

  if (offer.status === "accepted" && offer.completed) {
    return (
      <p className="rounded-lg bg-zinc-100 p-4 text-lg font-medium text-zinc-800">
        Marked done at {place}. You&apos;re free for the next request.
      </p>
    );
  }

  if (offer.status === "accepted") {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-green-50 p-4 text-lg font-medium text-green-800">
          You&apos;re confirmed. Go to {place}.
        </p>
        {unmatched}
        <p>{offer.need}</p>
        {/* Above the map, which fills most of the screen on a phone. */}
        <button
          onClick={onDone}
          className="rounded-lg bg-zinc-900 py-4 text-lg font-semibold text-white"
        >
          Done, I&apos;ve checked on them
        </button>
        {doneError && (
          <p className="text-sm text-red-600">
            Could not mark this done. Try again.
          </p>
        )}
        <RouteMap
          from={offer.from}
          to={offer.to}
          checkId={offer.checkId}
          buildingName={offer.buildingName}
          room={offer.room}
          label={`${offer.studentName} · ${place}`}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4">
      <div>
        <p className="text-xl font-semibold">{offer.studentName}</p>
        <p className="text-zinc-600">{place}</p>
        {unmatched}
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
