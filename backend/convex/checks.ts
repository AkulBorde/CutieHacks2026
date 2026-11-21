// Owner: backend
//
// TODO listForIncident (query): checks + student + building, for the map dots
// TODO counters (query): accounted for / need help / urgent / no answer
// TODO markCalling (internal mutation): store the call id, or mark the call failed
// TODO recordAnswers (internal mutation): save answers, set status with
//      deriveStatus from lib/status.ts, trigger a proposal if help is needed
// TODO finishCall (internal mutation): save transcript, run lib/honesty scan,
//      handle no answer + retry. Must be safe to run twice for the same call.
// TODO markManual (mutation): the dashboard's manual "mark as needs help"
export {};
