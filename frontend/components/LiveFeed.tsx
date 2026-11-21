import type { Doc, Id } from "@rollcall/backend/convex/_generated/dataModel";
import { STATUS_COLORS, STATUS_LABELS, type CheckStatus } from "@/lib/status";

// The call currently on screen. Comes from the checks table (query not written yet).
export type FeedCall = {
  checkId: Id<"checks">;
  studentName: string;
  status: CheckStatus;
  transcript?: string;
  answers?: Doc<"checks">["answers"];
};

function yesNo(value: boolean | undefined) {
  return value === undefined ? "-" : value ? "Yes" : "No";
}

export default function LiveFeed({
  call,
  onMarkNeedsHelp,
}: {
  call: FeedCall | null;
  onMarkNeedsHelp: (checkId: Id<"checks">) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 p-4">
      <h2 className="mb-3 font-semibold">Live feed</h2>

      {call === null ? (
        <p className="text-sm text-zinc-500">No call in progress.</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-medium">
            {call.studentName}
            <span
              className="ml-2 text-xs"
              style={{ color: STATUS_COLORS[call.status] }}
            >
              {STATUS_LABELS[call.status]}
            </span>
          </p>

          <p className="whitespace-pre-wrap rounded bg-zinc-50 p-2 text-zinc-700">
            {call.transcript ?? "Waiting for the transcript..."}
          </p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-600">
            <dt>Safe</dt>
            <dd>{yesNo(call.answers?.safe)}</dd>
            <dt>Location</dt>
            <dd>{call.answers?.location ?? "-"}</dd>
            <dt>Injured</dt>
            <dd>{yesNo(call.answers?.injured)}</dd>
            <dt>Life threat</dt>
            <dd>{yesNo(call.answers?.lifeThreat)}</dd>
            <dt>Needs help moving</dt>
            <dd>{yesNo(call.answers?.needsHelpMoving)}</dd>
            <dt>Others nearby</dt>
            <dd>{call.answers?.othersNearby ?? "-"}</dd>
          </dl>

          <button
            onClick={() => onMarkNeedsHelp(call.checkId)}
            className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            Mark as needs help
          </button>
        </div>
      )}
    </section>
  );
}
