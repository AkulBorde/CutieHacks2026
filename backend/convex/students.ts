// Real students sign themselves up from /join (the QR code on the landing
// page). Owner: backend.
//
// Nothing here places a call. Signing up puts a real phone number on a
// student in a building; incidents.start then calls every real student with a
// phone in the buildings the dispatcher picks.
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { toE164 } from "./lib/phone";

const MAX_NAME_LENGTH = 60;
const MAX_ROOM_LENGTH = 20;
// A public form that leads to real phone calls needs a ceiling.
const MAX_REAL_STUDENTS = 200;

export const signUp = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    buildingId: v.id("buildings"),
    room: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name.length === 0) throw new ConvexError("Enter your name.");
    if (name.length > MAX_NAME_LENGTH) throw new ConvexError("That name is too long.");
    const room = (args.room ?? "").trim();
    if (room.length > MAX_ROOM_LENGTH) throw new ConvexError("That room is too long.");

    const phone = toE164(args.phone);
    if (!phone) throw new ConvexError("That doesn't look like a phone number.");

    const building = await ctx.db.get(args.buildingId);
    if (!building) throw new ConvexError("Pick a building from the list.");

    // Signing up again with the same number moves that person instead of
    // adding a second copy who would get a second call.
    const existing = await ctx.db
      .query("students")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        buildingId: building._id,
        room,
        isReal: true,
      });
      return { buildingName: building.name, phoneEnding: phone.slice(-4) };
    }

    const real = await ctx.db
      .query("students")
      .filter((q) => q.eq(q.field("isReal"), true))
      .take(MAX_REAL_STUDENTS);
    if (real.length >= MAX_REAL_STUDENTS) {
      throw new ConvexError("Sign-ups are full right now.");
    }

    await ctx.db.insert("students", {
      name,
      phone,
      buildingId: building._id,
      room,
      isReal: true,
    });
    return { buildingName: building.name, phoneEnding: phone.slice(-4) };
  },
});

// Takes a signed-up number back off, e.g. after a demo:
//   npx convex run students:removeSignUp '{"phone":"+19095551234"}'
export const removeSignUp = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const phone = toE164(args.phone);
    if (!phone) return 0;
    const found = await ctx.db
      .query("students")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .collect();
    for (const student of found) await ctx.db.delete(student._id);
    return found.length;
  },
});
