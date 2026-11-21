// Owner: simulation
//
// Fills in the ~45 simulated students so the map resolves during the demo.
// No phone call is ever placed from this file.
//
// TODO simulateResult (internal mutation): given a checkId, write fake answers
//      and set the status through the same deriveStatus rule real calls use.
//      Set source to "simulated".
// TODO decide the mix (mostly safe, a few needs_help, one urgent, a few
//      no_answer) and the random delay range.
//
// incidents.start schedules this per simulated student, for example:
//   ctx.scheduler.runAfter(delayMs, internal.simulator.simulateResult, { checkId })
export {};
