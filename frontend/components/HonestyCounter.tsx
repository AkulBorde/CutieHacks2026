// How many times the agent said help was coming before a responder accepted.
// Fed by the banned-phrase scan on every call transcript. The goal is zero.
export default function HonestyCounter({
  flagged,
  calls,
}: {
  flagged: number;
  calls: number;
}) {
  return (
    <p
      className={`rounded-lg border p-3 text-sm ${
        flagged === 0
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      <span className="font-semibold">{flagged}</span> unconfirmed{" "}
      {flagged === 1 ? "promise" : "promises"} in{" "}
      <span className="font-semibold">{calls}</span>{" "}
      {calls === 1 ? "call" : "calls"}
    </p>
  );
}
