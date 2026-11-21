import { STATUS_COLORS, STATUS_LABELS, type CheckStatus } from "@/lib/status";

// One entry per colour, not per status: pending, calling and no answer share grey.
const ENTRIES: { status: CheckStatus; label: string }[] = [
  { status: "pending", label: "Pending / no answer" },
  { status: "safe", label: STATUS_LABELS.safe },
  { status: "needs_help", label: STATUS_LABELS.needs_help },
  { status: "urgent", label: STATUS_LABELS.urgent },
];

export default function Legend() {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-zinc-600">
      {ENTRIES.map(({ status, label }) => (
        <li key={status} className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[status] }}
          />
          {label}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-400" />
        Simulated student
      </li>
    </ul>
  );
}
