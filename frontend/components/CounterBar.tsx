import { STATUS_COLORS } from "@/lib/status";

export type Counts = {
  accountedFor: number;
  needsHelp: number;
  urgent: number;
  noAnswer: number;
};

export default function CounterBar({ counts }: { counts: Counts }) {
  const items = [
    { label: "accounted for", value: counts.accountedFor, color: STATUS_COLORS.safe },
    { label: "need help", value: counts.needsHelp, color: STATUS_COLORS.needs_help },
    { label: "urgent", value: counts.urgent, color: STATUS_COLORS.urgent },
    { label: "no answer", value: counts.noAnswer, color: STATUS_COLORS.no_answer },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-zinc-200 p-3">
          <dd className="text-2xl font-semibold" style={{ color: item.color }}>
            {item.value}
          </dd>
          <dt className="text-sm text-zinc-500">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}
