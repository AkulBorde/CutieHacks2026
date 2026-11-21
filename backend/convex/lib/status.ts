// Plain functions, no Convex imports, so tests can import them directly.
// Status is decided here, by rule. The model only fills in the answers.

export type Answers = {
  safe?: boolean;
  location?: string;
  injured?: boolean;
  lifeThreat?: boolean;
  needsHelpMoving?: boolean;
  othersNearby?: string;
};

export type AnsweredStatus = "urgent" | "needs_help" | "safe";

export function deriveStatus(answers: Answers): AnsweredStatus {
  if (answers.injured || answers.lifeThreat) return "urgent";
  // Anything short of a clear "I'm safe" sends someone. That includes a call
  // that ended before the question was answered (safe is undefined).
  if (answers.needsHelpMoving || answers.safe !== true) return "needs_help";
  return "safe";
}

// The fixed sentence the agent reads back, word for word. None of these may
// say or imply that help is on the way.
export function closingLine(status: AnsweredStatus): string {
  switch (status) {
    case "safe":
      return "Thank you. You're marked safe. Goodbye.";
    case "needs_help":
      return "I've logged that you need help. I'll call you back as soon as someone is confirmed.";
    case "urgent":
      return "You're flagged as urgent. If this is life-threatening, call 911 now. I'll call you back as soon as someone is confirmed.";
  }
}
