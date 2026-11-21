// Demo data: 3 halls, 50 simulated students, 5 responders. All names are
// made up and nobody has a phone number, so nothing here can be dialled.
// Add real phones (isReal: true) by hand in the Convex dashboard, never here.
//
// Run with: npm run seed -w @rollcall/backend
import { internalMutation } from "./_generated/server";

// Approximate positions of three UCR residence halls.
const HALLS = [
  { name: "Aberdeen-Inverness", lat: 33.9783, lng: -117.3255 },
  { name: "Lothian", lat: 33.9757, lng: -117.3222 },
  { name: "Pentland Hills", lat: 33.9779, lng: -117.3215 },
];

const FIRST_NAMES = [
  "Avery", "Jordan", "Riley", "Casey", "Morgan",
  "Quinn", "Rowan", "Sage", "Emery", "Parker",
];
const LAST_NAMES = ["Okafor", "Lindqvist", "Tanaka", "Moreno", "Abbasi"];

const RESPONDERS = [
  { name: "Alex Kim", role: "RA" as const, lat: 33.9781, lng: -117.3249 },
  { name: "Priya Shah", role: "RA" as const, lat: 33.9759, lng: -117.3228 },
  { name: "Marcus Bell", role: "CSO" as const, lat: 33.9768, lng: -117.3236 },
  { name: "Elena Cruz", role: "CSO" as const, lat: 33.9775, lng: -117.3219 },
  { name: "Tomas Reyes", role: "volunteer" as const, lat: 33.9749, lng: -117.3241 },
];

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Safe to run twice: a seeded database is left alone.
    const existing = await ctx.db.query("buildings").first();
    if (existing) return "Already seeded. Clear the tables in the dashboard to reseed.";

    const buildingIds = [];
    for (const hall of HALLS) {
      buildingIds.push(await ctx.db.insert("buildings", hall));
    }

    let students = 0;
    for (const last of LAST_NAMES) {
      for (const first of FIRST_NAMES) {
        const floor = (students % 4) + 1;
        const door = String((students * 7) % 30 + 1).padStart(2, "0");
        await ctx.db.insert("students", {
          name: `${first} ${last}`,
          buildingId: buildingIds[students % buildingIds.length],
          room: `${floor}${door}`,
          isReal: false,
        });
        students++;
      }
    }

    for (const responder of RESPONDERS) {
      await ctx.db.insert("responders", { ...responder, available: true });
    }

    return `Seeded ${buildingIds.length} buildings, ${students} students, ${RESPONDERS.length} responders.`;
  },
});

// Wipes every incident, check and assignment and frees all responders, so the
// demo can be rehearsed again. Buildings, students and responders are kept.
//
// Run with: npx convex run seed:resetIncidents (inside backend/)
export const resetIncidents = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["assignments", "checks", "incidents"] as const) {
      for (const doc of await ctx.db.query(table).collect()) {
        await ctx.db.delete(doc._id);
      }
    }
    for (const responder of await ctx.db.query("responders").collect()) {
      await ctx.db.patch(responder._id, { available: true });
    }
    return "Incidents cleared.";
  },
});
