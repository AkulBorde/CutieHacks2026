// The one worked example: a public query the dashboard already subscribes to.
// Copy this shape for the other queries and mutations.
import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("buildings").collect();
  },
});
