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
import { locate } from "./lib/campus";
import { distanceMeters, etaMinutes } from "./lib/geo";
import { dispatchRank, needsResponder } from "./lib/status";

const OFFER_WINDOW_MS = 2 * 60 * 1000;

// Pick the nearest free responder for a check and write a "proposed"
// assignment. Covers students who need help and students who did not answer.
// Does nothing if the check already has a live assignment, so it is safe to
// call more than once. Returns whether it proposed someone.
export async function proposeFor(ctx: MutationCtx, checkId: Id<"checks">) {
  const check = await ctx.db.get(checkId);
  if (!check || !needsResponder(check.status)) return false;

  const siblings = await ctx.db
    .query("assignments")
    .withIndex("by_check", (q) => q.eq("checkId", checkId))
    .collect();
  if (siblings.some((s) => s.status !== "expired")) return false;
  const alreadyTried = new Set(siblings.map((s) => s.responderId));

  // A responder proposed for another check is spoken for, even though they
  // only become unavailable once the dispatcher approves. One exception: a
  // student who asked for help may take a responder who is only proposed for
  // a no-answer, so no-answers cannot use up everyone first. Whichever of the
  // two the dispatcher approves second moves on to the next responder (see
  // `approve`).
  const all = await ctx.db.query("assignments").collect();
  const proposedElsewhere = new Set<Id<"responders">>();
  for (const a of all) {
    if (a.status !== "proposed") continue;
    if (check.status !== "no_answer") {
      const other = await ctx.db.get(a.checkId);
      if (other?.status === "no_answer") continue;
    }
    proposedElsewhere.add(a.responderId);
  }

  const student = await ctx.db.get(check.studentId);
  const building = student && (await ctx.db.get(student.buildingId));
  if (!student || !building) return false;
  // Nearest to where the student is, which is not always their dorm. With no
  // answer there is nothing they said, so this is their registered room.
  const where = locate(check, student, building);

  const responders = await ctx.db.query("responders").collect();
  const free = responders
    .filter(
      (r) =>
        r.available && !alreadyTried.has(r._id) && !proposedElsewhere.has(r._id),
    )
    .map((r) => ({ responder: r, meters: distanceMeters(r, where) }))
    .sort((a, b) => a.meters - b.meters);

  const nearest = free[0];
  if (!nearest) return false; // nobody free; the queue shows "Looking for a responder..."

  await ctx.db.insert("assignments", {
    checkId,
    responderId: nearest.responder._id,
    status: "proposed",
    etaMinutes: etaMinutes(nearest.meters),
    offerToken: crypto.randomUUID(),
  });
  return true;
}

// A responder has just become free: propose them for whoever is still waiting
// with nobody assigned, in queue order. One free responder can only go to one
// student, so this stops at the first proposal.
async function proposeForWaiting(ctx: MutationCtx, incidentId: Id<"incidents">) {
  const incident = await ctx.db.get(incidentId);
  if (incident?.status !== "active") return;

  const all = await ctx.db.query("assignments").collect();
  const covered = new Set(
    all.filter((a) => a.status !== "expired").map((a) => a.checkId),
  );
  const checks = await ctx.db
    .query("checks")
    .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
    .collect();
  const waiting = checks
    .filter((c) => needsResponder(c.status) && !covered.has(c._id))
    .sort(
      (a, b) =>
        dispatchRank(a.status) - dispatchRank(b.status) ||
        a.updatedAt - b.updatedAt,
    );
  for (const check of waiting) {
    if (await proposeFor(ctx, check._id)) return;
  }
}

// What the responder is told the student needs, built from the answers.
function describeNeed(check: {
  status: string;
  answers?: {
    injured?: boolean;
    lifeThreat?: boolean;
    needsHelpMoving?: boolean;
    othersNearby?: string;
  };
}) {
  if (check.status === "no_answer") {
    return "Did not answer the check-in call. Check on them in person.";
  }
  const answers = check.answers;
  const parts: string[] = [];
  if (answers?.lifeThreat) parts.push("Possible life threat reported.");
  if (answers?.injured) parts.push("Injury reported.");
  if (answers?.needsHelpMoving) parts.push("Needs help getting out.");
  if (parts.length === 0) parts.push("Needs help. No details were given.");
  if (answers?.othersNearby) parts.push(`Others nearby: ${answers.othersNearby}`);
  return parts.join(" ");
}

// The dashboard's help queue: urgent first, then students who asked for help,
// then no-answers. Longest-waiting first within each. Students a responder
// has finished with stay listed, at the bottom.
export const queue = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();

    const items = [];
    for (const check of checks) {
      if (!needsResponder(check.status)) continue;

      const student = await ctx.db.get(check.studentId);
      const building = student && (await ctx.db.get(student.buildingId));
      if (!student || !building) continue;

      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_check", (q) => q.eq("checkId", check._id))
        .collect();
      const live = assignments.find((a) => a.status !== "expired");
      const responder = live && (await ctx.db.get(live.responderId));

      const where = locate(check, student, building);
      items.push({
        checkId: check._id,
        status: check.status,
        updatedAt: check.updatedAt,
        studentName: student.name,
        // Where the responder is sent.
        buildingName: where.buildingName,
        room: where.room,
        // Their registered room, when they said they are somewhere else.
        dorm:
          where.buildingName === building.name
            ? undefined
            : { buildingName: building.name, room: student.room },
        // Their words, when they named a place we could not match. The
        // building above is only their dorm then, so the dispatcher must see.
        unmatchedLocation: where.unmatched,
        assignment:
          live && responder
            ? {
                id: live._id,
                status:
                  live.completedAt !== undefined
                    ? ("completed" as const)
                    : live.status,
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
        Number(a.assignment?.status === "completed") -
          Number(b.assignment?.status === "completed") ||
        dispatchRank(a.status) - dispatchRank(b.status) ||
        a.updatedAt - b.updatedAt,
    );
  },
});

// The responders the dashboard's map draws: everyone with an offer out or
// accepted in this incident, until they say they are done. No phone reports a position, so `lat`/`lng` is
// where the responder started and the map estimates the walk from
// `acceptedAt` and `etaMinutes`.
export const responders = query({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();

    const rows = [];
    for (const check of checks) {
      if (!needsResponder(check.status)) continue;

      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_check", (q) => q.eq("checkId", check._id))
        .collect();
      const live = assignments.find(
        (a) =>
          (a.status === "offered" || a.status === "accepted") &&
          a.completedAt === undefined,
      );
      const responder = live && (await ctx.db.get(live.responderId));
      if (!live || !responder) continue;

      rows.push({
        assignmentId: live._id,
        checkId: check._id,
        name: responder.name,
        role: responder.role,
        lat: responder.lat,
        lng: responder.lng,
        status: live.status as "offered" | "accepted",
        etaMinutes: live.etaMinutes,
        acceptedAt: live.acceptedAt,
      });
    }
    return rows;
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
    const where = locate(check, student, building);

    return {
      status: a.status,
      // The responder has said they are done with this student.
      completed: a.completedAt !== undefined,
      // The 3D view picks which building of a hall a student is drawn in from
      // this id; the responder map uses it to pick the same one.
      checkId: check._id,
      studentName: student.name,
      buildingName: where.buildingName,
      room: where.room,
      unmatchedLocation: where.unmatched,
      need: describeNeed(check),
      distanceMeters: distanceMeters(responder, where),
      etaMinutes: a.etaMinutes,
      offerExpiresAt: a.offerExpiresAt,
      // Ends of the walking route the responder sees once they accept.
      from: { lat: responder.lat, lng: responder.lng },
      to: { lat: where.lat, lng: where.lng },
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

// Responder taps Done once they have checked on the student. They are free
// again, from where they now are, and are proposed for whoever is waiting.
export const complete = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await ctx.db
      .query("assignments")
      .withIndex("by_token", (q) => q.eq("offerToken", token))
      .unique();
    if (!a || a.status !== "accepted") return { ok: false as const };
    // A second tap changes nothing.
    if (a.completedAt !== undefined) return { ok: true as const };

    await ctx.db.patch(a._id, { completedAt: Date.now() });

    const check = await ctx.db.get(a.checkId);
    const incident = check && (await ctx.db.get(check.incidentId));
    // Ending an incident already frees everyone. After that this responder
    // may be busy in a newer incident, so leave them as they are.
    if (!check || incident?.status !== "active") return { ok: true as const };

    const student = await ctx.db.get(check.studentId);
    const building = student && (await ctx.db.get(student.buildingId));
    const here = student && building ? locate(check, student, building) : null;
    await ctx.db.patch(a.responderId, {
      available: true,
      // They are standing where the student is, not back at their post.
      ...(here ? { lat: here.lat, lng: here.lng } : {}),
    });
    await proposeForWaiting(ctx, incident._id);
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
    // The responder who let it run out is free for someone else who is
    // waiting (they are not proposed for this same student again).
    const check = await ctx.db.get(a.checkId);
    if (check) await proposeForWaiting(ctx, check.incidentId);
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
