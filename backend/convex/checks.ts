import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { proposeFor } from "./assignments";
import { scan } from "./lib/honesty";
import { closingLine, deriveStatus } from "./lib/status";

const answersValidator = v.object({
  safe: v.optional(v.boolean()),
  location: v.optional(v.string()),
  injured: v.optional(v.boolean()),
  lifeThreat: v.optional(v.boolean()),
  needsHelpMoving: v.optional(v.boolean()),
  othersNearby: v.optional(v.string()),
});

// One dot per student for the map.
export const listForIncident = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();

    const dots = [];
    for (const check of checks) {
      const student = await ctx.db.get(check.studentId);
      const building = student && (await ctx.db.get(student.buildingId));
      if (!student || !building) continue;
      dots.push({
        checkId: check._id,
        studentName: student.name,
        status: check.status,
        isReal: student.isReal,
        lat: building.lat,
        lng: building.lng,
      });
    }
    return dots;
  },
});

export const counters = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();
    const count = (status: string) =>
      checks.filter((c) => c.status === status).length;
    return {
      total: checks.length,
      accountedFor: count("safe"),
      needsHelp: count("needs_help"),
      urgent: count("urgent"),
      noAnswer: count("no_answer"),
    };
  },
});

// The live feed: the call that changed most recently.
export const currentCall = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();
    const latest = checks
      // Simulated students only show up here once they have something to
      // read, such as the confirmation line that would have been spoken.
      .filter(
        (c) =>
          c.status !== "pending" &&
          (c.source !== "simulated" || c.transcript !== undefined),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!latest) return null;

    const student = await ctx.db.get(latest.studentId);
    return {
      checkId: latest._id,
      studentName: student?.name ?? "Unknown student",
      status: latest.status,
      transcript: latest.transcript,
      answers: latest.answers,
    };
  },
});

// The honesty counter: calls where the agent said a banned phrase, out of
// real calls that have a transcript. `attempts` only goes up when a real call
// is placed, so simulated students are never counted.
export const honesty = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();
    const calls = checks.filter(
      (c) => c.attempts > 0 && c.transcript !== undefined,
    );
    return {
      calls: calls.length,
      flagged: calls.filter((c) => c.honestyFlags.length > 0).length,
    };
  },
});

// Called by placeCheckInCall once Retell has answered the request.
export const markCalling = internalMutation({
  args: {
    checkId: v.id("checks"),
    callId: v.optional(v.string()),
    failed: v.boolean(),
  },
  handler: async (ctx, { checkId, callId, failed }) => {
    const check = await ctx.db.get(checkId);
    if (!check) return;
    await ctx.db.patch(checkId, {
      // A call that could not be placed must not sit on "calling" forever.
      status: failed ? "no_answer" : "calling",
      callId: failed ? undefined : callId,
      attempts: check.attempts + 1,
      updatedAt: Date.now(),
    });
  },
});

// The save_answers tool call. Code decides the status; the model only
// supplied the answers. Returns the fixed line the agent reads back.
export const recordAnswers = internalMutation({
  args: { checkId: v.id("checks"), answers: answersValidator },
  handler: async (ctx, { checkId, answers }) => {
    const status = deriveStatus(answers);
    await ctx.db.patch(checkId, { answers, status, updatedAt: Date.now() });
    await proposeFor(ctx, checkId);
    return { status, closingLine: closingLine(status) };
  },
});

// transcript_updated: keeps the live feed moving during the call.
export const updateTranscript = internalMutation({
  args: { checkId: v.id("checks"), callId: v.string(), transcript: v.string() },
  handler: async (ctx, { checkId, callId, transcript }) => {
    const check = await ctx.db.get(checkId);
    if (!check || check.callId !== callId) return;
    await ctx.db.patch(checkId, { transcript, updatedAt: Date.now() });
  },
});

// call_ended. Retell can deliver the same event more than once, so this must
// give the same result however many times it runs for one call.
export const finishCall = internalMutation({
  args: {
    checkId: v.id("checks"),
    callId: v.string(),
    noAnswer: v.boolean(),
    transcript: v.optional(v.string()),
    agentSpeech: v.optional(v.string()),
  },
  handler: async (ctx, { checkId, callId, noAnswer, transcript, agentSpeech }) => {
    const check = await ctx.db.get(checkId);
    // Ignore events for a call this check has already moved on from. That
    // covers duplicates of a no-answer event, since callId is cleared below.
    if (!check || check.callId !== callId) return;

    // One call per student, no redial. Voicemail or a missed call is flagged
    // for an in-person check.
    if (noAnswer) {
      await ctx.db.patch(checkId, {
        status: "no_answer",
        callId: undefined,
        updatedAt: Date.now(),
      });
      return;
    }

    await ctx.db.patch(checkId, {
      transcript: transcript ?? check.transcript,
      honestyFlags: scan(agentSpeech ?? ""),
      // Connected but save_answers never ran: when unsure, send someone.
      status: check.status === "calling" ? "needs_help" : check.status,
      updatedAt: Date.now(),
    });
    await proposeFor(ctx, checkId);
  },
});

// The dashboard's manual override, for when the agent stalls or mishears.
export const markManual = mutation({
  args: { checkId: v.id("checks") },
  handler: async (ctx, { checkId }) => {
    const check = await ctx.db.get(checkId);
    if (!check || check.status === "urgent") return;
    await ctx.db.patch(checkId, {
      status: "needs_help",
      source: "manual",
      updatedAt: Date.now(),
    });
    await proposeFor(ctx, checkId);
  },
});

// For simulated students no confirmation call is placed. The line that would
// have been spoken is appended to the transcript so the feed can show it.
export const logSpokenLine = internalMutation({
  args: { checkId: v.id("checks"), line: v.string() },
  handler: async (ctx, { checkId, line }) => {
    const check = await ctx.db.get(checkId);
    if (!check) return;
    const entry = `Confirmation (not spoken, simulated student): ${line}`;
    if (check.transcript?.includes(entry)) return;
    await ctx.db.patch(checkId, {
      transcript: check.transcript ? `${check.transcript}\n${entry}` : entry,
      updatedAt: Date.now(),
    });
  },
});
