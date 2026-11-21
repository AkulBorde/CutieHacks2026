import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { distanceMeters, etaMinutes } from "./lib/geo";

const OFFER_WINDOW_MS = 2 * 60 * 1000;

// Pick the nearest free responder for a check and write a "proposed"
// assignment. Does nothing if the check already has a live assignment, so it
// is safe to call more than once.
export async function proposeFor(ctx: MutationCtx, checkId: Id<"checks">) {
  const check = await ctx.db.get(checkId);
  if (!check) return;
  if (check.status !== "needs_help" && check.status !== "urgent") return;

  const siblings = await ctx.db
    .query("assignments")
    .withIndex("by_check", (q) => q.eq("checkId", checkId))
    .collect();
  if (siblings.some((s) => s.status !== "expired")) return;
  const alreadyTried = new Set(siblings.map((s) => s.responderId));

  // A responder proposed for another check is spoken for, even though they
  // only become unavailable once the dispatcher approves.
  const all = await ctx.db.query("assignments").collect();
  const proposedElsewhere = new Set(
    all.filter((a) => a.status === "proposed").map((a) => a.responderId),
  );

  const student = await ctx.db.get(check.studentId);
  const building = student && (await ctx.db.get(student.buildingId));
  if (!building) return;

  const responders = await ctx.db.query("responders").collect();
  const free = responders
    .filter(
      (r) =>
        r.available && !alreadyTried.has(r._id) && !proposedElsewhere.has(r._id),
    )
    .map((r) => ({ responder: r, meters: distanceMeters(r, building) }))
    .sort((a, b) => a.meters - b.meters);

  const nearest = free[0];
  if (!nearest) return; // nobody free; the queue shows "Looking for a responder..."

  await ctx.db.insert("assignments", {
    checkId,
    responderId: nearest.responder._id,
    status: "proposed",
    etaMinutes: etaMinutes(nearest.meters),
    offerToken: crypto.randomUUID(),
  });
}

// What the responder is told the student needs, built from the answers.
function describeNeed(answers: {
  injured?: boolean;
  lifeThreat?: boolean;
  needsHelpMoving?: boolean;
  othersNearby?: string;
} | undefined) {
  const parts: string[] = [];
  if (answers?.lifeThreat) parts.push("Possible life threat reported.");
  if (answers?.injured) parts.push("Injury reported.");
  if (answers?.needsHelpMoving) parts.push("Needs help getting out.");
  if (parts.length === 0) parts.push("Needs help. No details were given.");
  if (answers?.othersNearby) parts.push(`Others nearby: ${answers.othersNearby}`);
  return parts.join(" ");
}

// The dashboard's help queue: urgent first, then longest-waiting first.
export const queue = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();

    const items = [];
    for (const check of checks) {
      if (check.status !== "needs_help" && check.status !== "urgent") continue;

      const student = await ctx.db.get(check.studentId);
      const building = student && (await ctx.db.get(student.buildingId));
      if (!student || !building) continue;

      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_check", (q) => q.eq("checkId", check._id))
        .collect();
      const live = assignments.find((a) => a.status !== "expired");
      const responder = live && (await ctx.db.get(live.responderId));

      items.push({
        checkId: check._id,
        status: check.status,
        updatedAt: check.updatedAt,
        studentName: student.name,
        buildingName: building.name,
        room: student.room,
        assignment:
          live && responder
            ? {
                id: live._id,
                status: live.status,
                responderName: responder.name,
                etaMinutes: live.etaMinutes,
                // Only once approved: the link the responder opens.
                offerToken: live.status === "proposed" ? undefined : live.offerToken,
              }
            : undefined,
      });
    }

    return items.sort(
      (a, b) =>
        Number(b.status === "urgent") - Number(a.status === "urgent") ||
        a.updatedAt - b.updatedAt,
    );
  },
});

// What the responder page at /r/[token] shows. Null for an unknown token, or
// one the dispatcher has not approved yet.
export const byToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await ctx.db
      .query("assignments")
      .withIndex("by_token", (q) => q.eq("offerToken", token))
      .unique();
    if (!a || a.status === "proposed") return null;

    const check = await ctx.db.get(a.checkId);
    const responder = await ctx.db.get(a.responderId);
    const student = check && (await ctx.db.get(check.studentId));
    const building = student && (await ctx.db.get(student.buildingId));
    if (!check || !responder || !student || !building) return null;

    return {
      status: a.status,
      studentName: student.name,
      buildingName: building.name,
      room: student.room,
      need: describeNeed(check.answers),
      distanceMeters: distanceMeters(responder, building),
      etaMinutes: a.etaMinutes,
      offerExpiresAt: a.offerExpiresAt,
    };
  },
});

// Dispatcher approves a proposal: the offer goes live for two minutes.
export const approve = mutation({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, { assignmentId }) => {
    const a = await ctx.db.get(assignmentId);
    if (!a || a.status !== "proposed") return { ok: false as const };

    const responder = await ctx.db.get(a.responderId);
    if (!responder || !responder.available) {
      // They were taken in the meantime. Drop this proposal and try the next.
      await ctx.db.patch(a._id, { status: "expired" });
      await proposeFor(ctx, a.checkId);
      return { ok: false as const };
    }

    await ctx.db.patch(a._id, {
      status: "offered",
      offerExpiresAt: Date.now() + OFFER_WINDOW_MS,
    });
    await ctx.db.patch(responder._id, { available: false });
    await ctx.scheduler.runAfter(OFFER_WINDOW_MS, internal.assignments.expire, {
      assignmentId: a._id,
    });
    return { ok: true as const, offerToken: a.offerToken };
  },
});

// Responder taps Accept. Convex runs a mutation as one transaction, so the
// check and the write cannot interleave with another accept or with expire:
// if two taps arrive together, exactly one wins.
export const accept = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await ctx.db
      .query("assignments")
      .withIndex("by_token", (q) => q.eq("offerToken", token))
      .unique();
    if (!a) return { ok: false as const, reason: "not_found" as const };

    const siblings = await ctx.db
      .query("assignments")
      .withIndex("by_check", (q) => q.eq("checkId", a.checkId))
      .collect();
    const taken = siblings.some((s) => s.status === "accepted");
    const open = a.status === "offered" && (a.offerExpiresAt ?? 0) > Date.now();
    if (taken || !open) {
      return { ok: false as const, reason: "taken_or_expired" as const };
    }

    await ctx.db.patch(a._id, { status: "accepted", acceptedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.calls.placeConfirmationCall, {
      assignmentId: a._id,
    });
    return { ok: true as const };
  },
});

// Runs two minutes after approve. Does nothing unless the offer is still open.
export const expire = internalMutation({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, { assignmentId }) => {
    const a = await ctx.db.get(assignmentId);
    if (!a || a.status !== "offered") return;

    await ctx.db.patch(a._id, { status: "expired" });
    await ctx.db.patch(a.responderId, { available: true });
    await proposeFor(ctx, a.checkId);
  },
});

// Everything placeConfirmationCall needs, read fresh from the database.
export const confirmationInfo = internalQuery({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, { assignmentId }) => {
    const a = await ctx.db.get(assignmentId);
    if (!a) return null;
    const responder = await ctx.db.get(a.responderId);
    const check = await ctx.db.get(a.checkId);
    const student = check && (await ctx.db.get(check.studentId));
    if (!responder || !check || !student) return null;

    return {
      status: a.status,
      checkId: check._id,
      responderName: responder.name,
      etaMinutes: a.etaMinutes,
      studentIsReal: student.isReal,
      studentPhone: student.phone,
    };
  },
});

export const setConfirmationCall = internalMutation({
  args: { assignmentId: v.id("assignments"), callId: v.string() },
  handler: async (ctx, { assignmentId, callId }) => {
    await ctx.db.patch(assignmentId, { confirmationCallId: callId });
  },
});
