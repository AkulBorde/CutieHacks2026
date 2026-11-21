import type { Doc } from "@rollcall/backend/convex/_generated/dataModel";

export type CheckStatus = Doc<"checks">["status"];

// Grey = pending or no answer, green = safe, red = needs help, dark red = urgent.
export const STATUS_COLORS: Record<CheckStatus, string> = {
  pending: "#a1a1aa",
  calling: "#a1a1aa",
  no_answer: "#a1a1aa",
  safe: "#16a34a",
  needs_help: "#dc2626",
  urgent: "#7f1d1d",
};

export const STATUS_LABELS: Record<CheckStatus, string> = {
  pending: "Pending",
  calling: "Calling",
  no_answer: "No answer",
  safe: "Safe",
  needs_help: "Needs help",
  urgent: "Urgent",
};
