// Plain functions, no Convex imports, so tests can import them directly.

// Phrases the check-in agent must never say: each one tells the student that
// help is coming before a responder has accepted.
export const BANNED_PHRASES = [
  "on the way",
  "on their way",
  "is coming",
  "are coming",
  "will be there",
  "sending someone",
  "getting someone to you",
  "help is",
];

// Pass only the agent's side of the transcript. Returns the banned phrases
// found, each at most once. The confirmation call is exempt: do not scan it.
export function scan(agentSpeech: string): string[] {
  const text = agentSpeech.toLowerCase().replace(/\s+/g, " ");
  return BANNED_PHRASES.filter((phrase) => text.includes(phrase));
}
