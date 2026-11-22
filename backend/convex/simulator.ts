// Owner: simulation
//
// Fills in the simulated students so the map resolves during the demo.
// No phone call is ever placed from this file.
//
// incidents.start schedules one simulateResult per simulated student, after
// simulatedDelayMs(checkId).
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { proposeFor } from "./assignments";
import { deriveStatus } from "./lib/status";
import { simulatedAnswers, simulatedOutcome } from "./lib/simData";

export { simulatedDelayMs } from "./lib/simData";

export const simulateResult = internalMutation({
  args: { checkId: v.id("checks") },
  handler: async (ctx, { checkId }) => {
    const check = await ctx.db.get(checkId);
    // Only fill in checks that are still waiting; never touch a real call.
    if (!check || check.source !== "simulated") return;
    if (check.status !== "pending" && check.status !== "calling") return;
    // The incident may have been ended before this fired. A result now would
    // propose a responder for a closed incident and hold them out of the next.
    const incident = await ctx.db.get(check.incidentId);
    if (incident?.status !== "active") return;
    const student = await ctx.db.get(check.studentId);
    if (!student || student.isReal) return;
    const building = await ctx.db.get(student.buildingId);

    const location = `${building?.name ?? "Unknown"}, room ${student.room}`;
    const answers = simulatedAnswers(simulatedOutcome(checkId), location, checkId);
    // Same rule real calls use: status comes from code, never the model.
    const status = answers ? deriveStatus(answers) : "no_answer";

    await ctx.db.patch(checkId, {
      status,
      answers,
      attempts: check.attempts + 1,
      transcript: answers
        ? `[simulated] ${student.name} answered the check-in.`
        : "[simulated] No answer.",
      updatedAt: Date.now(),
    });
    // Same as a real call: needs_help, urgent and no_answer get the nearest
    // free responder proposed (proposeFor ignores every other status).
    await proposeFor(ctx, checkId);
  },
});
