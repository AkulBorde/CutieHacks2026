"use client";

// Step two of /join: the 3D campus, full screen. The student taps their hall
// (or its button), then their room on the floor plan, then confirms.
// three.js needs `window`, so load this with next/dynamic and ssr: false.
import { useMemo, useState } from "react";
import CampusSim from "@/components/simulation/CampusSim";
import type { PickedRoom } from "@/components/JoinForm";

type Building = { _id: string; name: string };

export default function RoomPicker({
  firstName,
  buildings,
  sending,
  error,
  onBack,
  onConfirm,
}: {
  firstName: string;
  buildings: Building[] | undefined;
  sending: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: (picked: PickedRoom) => void;
}) {
  const [picked, setPicked] = useState<PickedRoom | null>(null);
  // A new object on every tap, so tapping the same hall again re-opens it.
  const [open, setOpen] = useState<{ name: string } | null>(null);
  const names = useMemo(() => (buildings ?? []).map((b) => b.name).sort((a, b) => a.localeCompare(b)), [buildings]);
  const [quality] = useState<"high" | "low">(() => (window.innerWidth < 768 ? "low" : "high"));

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900" role="dialog" aria-label="Pick your room">
      <CampusSim
        className="h-full w-full"
        quality={quality}
        pickable={names}
        onPickRoom={setPicked}
        openBuilding={open}
      />

      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-3 rounded-xl bg-white p-4 text-[#18334D] shadow-2xl sm:inset-x-auto sm:left-3 sm:top-3 sm:bottom-auto sm:w-80">
        <div>
          <div className="text-lg font-bold text-[#102a43]">
            {firstName ? `${firstName}, where do you live?` : "Where do you live?"}
          </div>
          <p className="text-sm text-slate-500">
            Tap your hall, then tap your room on the floor plan.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {buildings === undefined && <span className="text-sm text-slate-400">Loading halls...</span>}
          {names.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setOpen({ name: n })}
              className={`rounded-full border px-3 py-1 text-sm ${
                picked?.buildingName === n
                  ? "border-[#18334D] bg-[#18334D] text-white"
                  : "border-slate-300 hover:bg-slate-100"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
          {picked ? (
            <>
              <span className="font-semibold">{picked.buildingName}</span> · Room {picked.room}
            </>
          ) : (
            <span className="text-slate-500">No room picked yet</span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-[10px] border border-slate-300 px-4 py-3 text-sm font-medium"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={!picked || sending}
            onClick={() => picked && onConfirm(picked)}
            className="flex-1 cursor-pointer rounded-[10px] bg-[#18334D] px-4 py-3 text-sm font-bold text-white disabled:cursor-default disabled:opacity-50"
          >
            {sending ? "Signing you up..." : "Confirm my room"}
          </button>
        </div>
      </div>
    </div>
  );
}
