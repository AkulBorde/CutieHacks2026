import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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

// An assignment that still covers its student: not run out, and the responder
// has not finished. A finished one is history, so if the student is flagged
// again later they get a new responder.
function isLive(a: { status: string; completedAt?: number }) {
  return a.status !== "expired" && a.completedAt === undefined;
}

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
  if (siblings.some(isLive)) return false;
  // Responders who let an offer for this student run out are not asked again.
  const alreadyTried = new Set(
    siblings.filter((s) => s.status === "expired").map((s) => s.responderId),
  );

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
  const covered = new Set(all.filter(isLive).map((a) => a.checkId));
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
// then no-answers. Longest-waiting first within each. A student a responder
// has checked on is marked safe by `complete`, so they are no longer here.
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
      const live = assignments.find(isLive);
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
    const incident = await ctx.db.get(check.incidentId);

    return {
      status: a.status,
      // A link from an incident that has ended must not look live: the same
      // student can be in a newer incident under a different link.
      incidentEnded: incident?.status !== "active",
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

    const check = await ctx.db.get(a.checkId);
    const student = check && (await ctx.db.get(check.studentId));
    if (student && !student.isReal) {
      // A simulated student gets a simulated response: nobody has to open a
      // link. The responder accepts at once, walks there on the map, and
      // arrives after the same ETA the map animates, which frees them.
      await ctx.db.patch(a._id, { status: "accepted", acceptedAt: Date.now() });
      await ctx.db.patch(responder._id, { available: false });
      // For a simulated student this only logs the line; no call is placed.
      await ctx.scheduler.runAfter(0, internal.calls.placeConfirmationCall, {
        assignmentId: a._id,
      });
      await ctx.scheduler.runAfter(
        a.etaMinutes * 60_000,
        internal.assignments.arrive,
        { assignmentId: a._id },
      );
      return { ok: true as const, offerToken: a.offerToken };
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
    // Someone has accepted and is still on it.
    const taken = siblings.some((s) => s.status === "accepted" && isLive(s));
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

// A responder has reached their student. The student is accounted for, and
// the responder is free again, from where they now are, and is proposed for
// whoever is waiting. Returns whether the assignment is now finished.
async function finish(ctx: MutationCtx, a: Doc<"assignments">) {
  if (a.status !== "accepted") return false;
  // A second tap changes nothing.
  if (a.completedAt !== undefined) return true;

  const check = await ctx.db.get(a.checkId);
  const incident = check && (await ctx.db.get(check.incidentId));
  // Ending an incident already frees everyone, and this responder may be
  // busy in a newer one. A tap on an old link must not look like it worked.
  if (!check || incident?.status !== "active") return false;

  await ctx.db.patch(a._id, { completedAt: Date.now() });

  const student = await ctx.db.get(check.studentId);
  const building = student && (await ctx.db.get(student.buildingId));
  const here = student && building ? locate(check, student, building) : null;

  // A responder is with them, so they leave the help queue and count as
  // accounted for. A call transcript gets a line saying why, since the
  // student's own words may still say they are hurt. A check with no
  // transcript is left without one: the honesty counter counts transcripts
  // as answered calls. `updatedAt` is left alone so the live feed does not
  // jump to this student.
  const responder = await ctx.db.get(a.responderId);
  const note = `Checked in person by ${responder?.name ?? "a responder"}.`;
  await ctx.db.patch(check._id, {
    status: "safe",
    ...(check.transcript
      ? { transcript: `${check.transcript}\n${note}` }
      : {}),
  });

  await ctx.db.patch(a.responderId, {
    available: true,
    // They are standing where the student is, not back at their post.
    ...(here ? { lat: here.lat, lng: here.lng } : {}),
  });
  await proposeForWaiting(ctx, incident._id);
  return true;
}

// Responder taps Done once they have checked on the student.
export const complete = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const a = await ctx.db
      .query("assignments")
      .withIndex("by_token", (q) => q.eq("offerToken", token))
      .unique();
    return { ok: a ? await finish(ctx, a) : false };
  },
});

// The simulated responder sent to a simulated student has had time to walk
// there (scheduled by `approve`). Same ending as a real responder's Done.
export const arrive = internalMutation({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, { assignmentId }) => {
    const a = await ctx.db.get(assignmentId);
    if (a) await finish(ctx, a);
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
