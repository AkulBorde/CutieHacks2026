import type { Id } from "@rollcall/backend/convex/_generated/dataModel";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status";

// One row of api.assignments.queue.
export type QueueItem = {
  checkId: Id<"checks">;
  status: "urgent" | "needs_help";
  studentName: string;
  // Where the responder is sent: where the student said they are on the
  // call, or their dorm room. No room if they only named a building.
  buildingName: string;
  room?: string;
  // Their registered room, when they said they are somewhere else.
  dorm?: { buildingName: string; room: string };
  // Their own words, when they named a place that could not be matched to a
  // building. The building above is only their dorm then.
  unmatchedLocation?: string;
  // Missing until a responder has been proposed for this check.
  assignment?: {
    id: Id<"assignments">;
    status: "proposed" | "offered" | "accepted" | "expired";
    responderName: string;
    etaMinutes: number;
    // Present once the dispatcher has approved: the responder's link.
    offerToken?: string;
  };
};

export default function HelpQueue({
  items,
  onApprove,
}: {
  items: QueueItem[];
  onApprove: (assignmentId: Id<"assignments">) => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 p-4">
      <h2 className="mb-3 font-semibold">Help queue</h2>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No one needs help yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li
              key={item.checkId}
              className="flex items-center justify-between gap-3 border-l-4 pl-3"
              style={{ borderColor: STATUS_COLORS[item.status] }}
            >
              <div className="text-sm">
                <p className="font-medium">
                  {item.studentName}
                  <span className="ml-2 text-xs text-zinc-500">
                    {STATUS_LABELS[item.status]}
                  </span>
                </p>
                <p className="text-zinc-500">
                  {item.buildingName}
                  {item.room ? `, room ${item.room}` : ""}
                </p>
                {item.dorm && (
                  <p className="text-xs text-zinc-400">
                    Said on the call. Dorm: {item.dorm.buildingName}, room{" "}
                    {item.dorm.room}
                  </p>
                )}
                {item.unmatchedLocation && (
                  <p className="text-xs font-medium text-amber-700">
                    Said &ldquo;{item.unmatchedLocation}&rdquo;, which is not a
                    building we know. Showing their dorm.
                  </p>
                )}
                <p className="text-zinc-500">
                  {item.assignment
                    ? `${item.assignment.responderName}, about ${item.assignment.etaMinutes} min`
                    : "Looking for a responder..."}
                </p>
              </div>

              {item.assignment?.status === "proposed" && (
                <button
                  onClick={() => onApprove(item.assignment!.id)}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Approve
                </button>
              )}
              {item.assignment && item.assignment.status !== "proposed" && (
                <div className="flex flex-col items-end gap-1 text-xs">
                  <span className="uppercase text-zinc-500">
                    {item.assignment.status}
                  </span>
                  {item.assignment.status === "offered" &&
                    item.assignment.offerToken && (
                      <a
                        href={`/r/${item.assignment.offerToken}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        Responder link
                      </a>
                    )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
