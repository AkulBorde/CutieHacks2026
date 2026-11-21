import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";

// The incident the dashboard is showing: the newest active one, or null.
export const current = query({
  args: {},
  handler: async (ctx) => {
    const incidents = await ctx.db.query("incidents").order("desc").take(10);
    return incidents.find((i) => i.status === "active") ?? null;
  },
});

export const start = mutation({
  args: {
    type: v.union(
      v.literal("earthquake"),
      v.literal("outage"),
      v.literal("evacuation"),
      v.literal("air_quality"),
    ),
    buildingIds: v.array(v.id("buildings")),
  },
  handler: async (ctx, { type, buildingIds }) => {
    if (buildingIds.length === 0) throw new Error("Pick at least one building.");

    const recent = await ctx.db.query("incidents").order("desc").take(10);
    if (recent.some((i) => i.status === "active")) {
      throw new Error("An incident is already running. End it first.");
    }

    const now = Date.now();
    const incidentId = await ctx.db.insert("incidents", {
      type,
      buildingIds,
      status: "active",
      startedAt: now,
    });

    for (const buildingId of buildingIds) {
      const students = await ctx.db
        .query("students")
        .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
        .collect();

      for (const student of students) {
        const canCall = student.isReal && student.phone !== undefined;
        const checkId = await ctx.db.insert("checks", {
          incidentId,
          studentId: student._id,
          // A real student with no phone on file can't be reached by a call.
          status: student.isReal && !canCall ? "no_answer" : "pending",
          source: student.isReal ? "call" : "simulated",
          attempts: 0,
          honestyFlags: [],
          updatedAt: now,
        });

        if (canCall) {
          await ctx.scheduler.runAfter(0, internal.calls.placeCheckInCall, {
            checkId,
            phone: student.phone!,
            studentName: student.name,
          });
        }
        // Simulation lane: simulated students (isReal false) stay "pending"
        // until simulator.ts schedules a fake result for them here.
      }
    }

    return incidentId;
  },
});

// Ends the incident and releases everything it was holding, so the next
// incident starts with every responder free.
export const close = mutation({
  args: { incidentId: v.id("incidents") },
  handler: async (ctx, { incidentId }) => {
    await ctx.db.patch(incidentId, { status: "closed" });

    const checks = await ctx.db
      .query("checks")
      .withIndex("by_incident", (q) => q.eq("incidentId", incidentId))
      .collect();
    for (const check of checks) {
      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_check", (q) => q.eq("checkId", check._id))
        .collect();
      for (const a of assignments) {
        if (a.status === "proposed" || a.status === "offered") {
          await ctx.db.patch(a._id, { status: "expired" });
        }
      }
    }

    for (const responder of await ctx.db.query("responders").collect()) {
      if (!responder.available) {
        await ctx.db.patch(responder._id, { available: true });
      }
    }
  },
});
