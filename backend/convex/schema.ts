// The shared contract between frontend, backend and the simulator.
// Copied from the architecture doc. Change it together, not alone.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  buildings: defineTable({
    name: v.string(),
    lat: v.number(),
    lng: v.number(),
  }),

  students: defineTable({
    name: v.string(),
    phone: v.optional(v.string()), // E.164, real phones only
    buildingId: v.id("buildings"),
    room: v.string(),
    isReal: v.boolean(), // false = simulated, never called
    accessibilityNotes: v.optional(v.string()),
  })
    .index("by_building", ["buildingId"])
    .index("by_phone", ["phone"]),

  responders: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    role: v.union(v.literal("RA"), v.literal("CSO"), v.literal("volunteer")),
    lat: v.number(),
    lng: v.number(),
    available: v.boolean(),
  }),

  incidents: defineTable({
    type: v.union(
      v.literal("earthquake"),
      v.literal("outage"),
      v.literal("evacuation"),
      v.literal("air_quality"),
    ),
    buildingIds: v.array(v.id("buildings")),
    status: v.union(v.literal("active"), v.literal("closed")),
    startedAt: v.number(),
  }),

  checks: defineTable({
    incidentId: v.id("incidents"),
    studentId: v.id("students"),
    status: v.union(
      v.literal("pending"),
      v.literal("calling"),
      v.literal("safe"),
      v.literal("needs_help"),
      v.literal("urgent"),
      v.literal("no_answer"),
    ),
    source: v.union(
      v.literal("call"),
      v.literal("simulated"),
      v.literal("manual"),
    ),
    answers: v.optional(
      v.object({
        safe: v.optional(v.boolean()),
        location: v.optional(v.string()),
        injured: v.optional(v.boolean()),
        lifeThreat: v.optional(v.boolean()),
        needsHelpMoving: v.optional(v.boolean()),
        othersNearby: v.optional(v.string()),
      }),
    ),
    transcript: v.optional(v.string()),
    callId: v.optional(v.string()), // the voice provider's call id
    attempts: v.number(),
    honestyFlags: v.array(v.string()), // banned phrases found in agent speech
    updatedAt: v.number(),
  })
    .index("by_incident", ["incidentId"])
    .index("by_callId", ["callId"]),

  assignments: defineTable({
    checkId: v.id("checks"),
    responderId: v.id("responders"),
    status: v.union(
      v.literal("proposed"),
      v.literal("offered"),
      v.literal("accepted"),
      v.literal("expired"),
    ),
    etaMinutes: v.number(),
    offerToken: v.string(), // unguessable, goes in the responder's link
    offerExpiresAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    confirmationCallId: v.optional(v.string()),
  })
    .index("by_check", ["checkId"])
    .index("by_token", ["offerToken"]),
});
