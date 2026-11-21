// The only file that talks to Retell. Secrets come from the Convex
// environment (`npx convex env set NAME value`), never from the repo:
//   RETELL_API_KEY, RETELL_FROM_NUMBER, RETELL_CHECKIN_AGENT_ID,
//   RETELL_CONFIRM_AGENT_ID
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const CREATE_CALL_URL = "https://api.retellai.com/v2/create-phone-call";

// Returns the new call's id, or null if the call could not be placed.
async function createPhoneCall(body: Record<string, unknown>): Promise<string | null> {
  const apiKey = process.env.RETELL_API_KEY;
  const fromNumber = process.env.RETELL_FROM_NUMBER;
  if (!apiKey || !fromNumber) {
    console.error("RETELL_API_KEY or RETELL_FROM_NUMBER is not set.");
    return null;
  }
  try {
    const res = await fetch(CREATE_CALL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from_number: fromNumber, ...body }),
    });
    if (!res.ok) {
      console.error(`Retell refused the call: ${res.status} ${await res.text()}`);
      return null;
    }
    const call = await res.json();
    return typeof call.call_id === "string" ? call.call_id : null;
  } catch (error) {
    console.error("Could not reach Retell:", error);
    return null;
  }
}

// The first call to one real student. Simulated students never get here:
// incidents.start only schedules this for isReal students with a phone.
export const placeCheckInCall = internalAction({
  args: { checkId: v.id("checks"), phone: v.string(), studentName: v.string() },
  handler: async (ctx, args) => {
    const callId = await createPhoneCall({
      to_number: args.phone,
      override_agent_id: process.env.RETELL_CHECKIN_AGENT_ID,
      // Comes back on every webhook for this call, which is how the webhook
      // knows which check an event belongs to.
      metadata: { checkId: args.checkId, kind: "checkin" },
      retell_llm_dynamic_variables: { student_name: args.studentName },
    });
    // A scheduled action runs at most once, so a failure has to be recorded
    // here or the check would sit on "calling" forever.
    await ctx.runMutation(internal.checks.markCalling, {
      checkId: args.checkId,
      callId: callId ?? undefined,
      failed: callId === null,
    });
  },
});

// THE HONESTY RULE. This is the only code path that produces a sentence
// about help arriving, and it refuses unless a responder has accepted in the
// database. The sentence is a template: the model contributes no words.
export const placeConfirmationCall = internalAction({
  args: { assignmentId: v.id("assignments") },
  handler: async (ctx, { assignmentId }) => {
    const info = await ctx.runQuery(internal.assignments.confirmationInfo, {
      assignmentId,
    });
    if (!info || info.status !== "accepted") return;

    const line = `${info.responderName} is on the way, about ${info.etaMinutes} minutes.`;

    if (!info.studentIsReal || !info.studentPhone) {
      await ctx.runMutation(internal.checks.logSpokenLine, {
        checkId: info.checkId,
        line,
      });
      return;
    }

    const callId = await createPhoneCall({
      to_number: info.studentPhone,
      override_agent_id: process.env.RETELL_CONFIRM_AGENT_ID,
      metadata: { checkId: info.checkId, kind: "confirmation" },
      retell_llm_dynamic_variables: { confirmation_line: line },
    });
    if (callId) {
      await ctx.runMutation(internal.assignments.setConfirmationCall, {
        assignmentId,
        callId,
      });
    }
  },
});
