// Owner: backend (voice)
//
// TODO placeCheckInCall (internal action): ask Retell to call one real student
// TODO placeConfirmationCall (internal action): the ONLY place that builds
//      "<name> is on the way, about <n> minutes." Returns early unless the
//      assignment is accepted. This is the honesty rule.
//
// Secrets come from process.env (set with `npx convex env set NAME value`):
//   RETELL_API_KEY, RETELL_FROM_NUMBER, RETELL_CHECKIN_AGENT_ID,
//   RETELL_CONFIRM_AGENT_ID
export {};
