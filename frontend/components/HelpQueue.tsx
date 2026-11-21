import type { Id } from "@rollcall/backend/convex/_generated/dataModel";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/status";

// What the dashboard needs from api.assignments.queue (not written yet).
export type QueueItem = {
  checkId: Id<"checks">;
  status: "urgent" | "needs_help";
  studentName: string;
  buildingName: string;
  room: string;
  // Missing until a responder has been proposed for this check.
  assignment?: {
    id: Id<"assignments">;
    status: "proposed" | "offered" | "accepted" | "expired";
    responderName: string;
    etaMinutes: number;
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
                  {item.buildingName}, room {item.room}
                </p>
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
                <span className="text-xs uppercase text-zinc-500">
                  {item.assignment.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
