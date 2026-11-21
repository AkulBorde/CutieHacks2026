// Owner: simulation
//
// Fills in the simulated students so the map resolves during the demo.
// No phone call is ever placed from this file.
//
// incidents.start schedules one of these per simulated student:
//   ctx.scheduler.runAfter(simulatedDelayMs(checkId), internal.simulator.simulateResult, { checkId });
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
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
      attempts: check.attempts + (status === "no_answer" ? 2 : 1),
      transcript: answers
        ? `[simulated] ${student.name} answered the check-in.`
        : "[simulated] No answer after retry.",
      updatedAt: Date.now(),
    });
    // TODO once backend has assignments.propose: for needs_help and urgent,
    //   await ctx.scheduler.runAfter(0, internal.assignments.propose, { checkId });
  },
});
