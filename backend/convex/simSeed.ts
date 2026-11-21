// Owner: simulation
//
// Adds every UCR housing community to the demo, on top of seed.ts (which
// loads three halls). One `buildings` row per community, named exactly as the
// 3D campus labels it, plus made-up simulated students and responders.
//
//   npx convex run simSeed:seedSimulation      (from the backend folder)
//
// Safe to run twice, before or after seed.ts: buildings are matched by name,
// a hall that already has students is left alone, and responders are only
// added if there are none. Real phones are added in the Convex dashboard.
import { internalMutation } from "./_generated/server";
import { SIM_HALLS, SIM_RESPONDERS, studentsFor } from "./lib/simData";

export const seedSimulation = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("buildings").collect();
    const added = { buildings: 0, students: 0, responders: 0 };
    let n = 0;

    for (const hall of SIM_HALLS) {
      const found = existing.find((x) => x.name === hall.name);
      const buildingId =
        found?._id ?? (await ctx.db.insert("buildings", { name: hall.name, lat: hall.lat, lng: hall.lng }));
      if (!found) added.buildings++;

      const has = await ctx.db
        .query("students")
        .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
        .first();
      if (!has) {
        for (const s of studentsFor(hall, n)) {
          await ctx.db.insert("students", {
            name: s.name,
            buildingId,
            room: s.room,
            isReal: false,
            ...(s.accessibilityNotes ? { accessibilityNotes: s.accessibilityNotes } : {}),
          });
          added.students++;
        }
      }
      n += hall.students;
    }

    if (!(await ctx.db.query("responders").first())) {
      for (const r of SIM_RESPONDERS) {
        await ctx.db.insert("responders", { ...r, available: true });
        added.responders++;
      }
    }
    return added;
  },
});
