// Retell's two webhooks. Served at https://<deployment-name>.convex.site
//   POST /retell/tool    the save_answers custom function, mid-call
//   POST /retell/events  call_ended and transcript_updated
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// call_ended reasons that mean nobody spoke to the agent. Voicemail counts:
// a machine answered, not the student.
const NO_ANSWER_REASONS = new Set([
  "dial_no_answer",
  "dial_busy",
  "dial_failed",
  "voicemail_reached",
  "user_declined",
  "invalid_destination",
  "marked_as_spam",
  "network_blocked",
]);

type TranscriptEntry = { role?: string; content?: string };

function agentSpeechOf(entries: unknown): string {
  if (!Array.isArray(entries)) return "";
  return (entries as TranscriptEntry[])
    .filter((e) => e.role === "agent")
    .map((e) => e.content ?? "")
    .join(" ");
}

function transcriptOf(call: { transcript?: unknown; transcript_object?: unknown }) {
  if (typeof call.transcript === "string" && call.transcript.length > 0) {
    return call.transcript;
  }
  if (!Array.isArray(call.transcript_object)) return undefined;
  return (call.transcript_object as TranscriptEntry[])
    .map((e) => `${e.role === "agent" ? "Agent" : "User"}: ${e.content ?? ""}`)
    .join("\n");
}

// Retell sends { name, call, args }. Whatever we reply is handed to the model
// as the tool result, so the reply is the fixed closing line and nothing else.
http.route({
  path: "/retell/tool",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // A static header set on the custom function in Retell's dashboard.
    const secret = process.env.ROLLCALL_WEBHOOK_SECRET;
    if (!secret || request.headers.get("x-rollcall-secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await request.json();
    if (body?.name !== "save_answers") {
      return json({ error: "unknown function" }, 400);
    }
    const checkId = body.call?.metadata?.checkId as Id<"checks"> | undefined;
    if (!checkId) return json({ error: "missing checkId in call metadata" }, 400);

    const args = body.args ?? {};
    const bool = (x: unknown) => (typeof x === "boolean" ? x : undefined);
    const text = (x: unknown) =>
      typeof x === "string" && x.length > 0 ? x : undefined;

    const result = await ctx.runMutation(internal.checks.recordAnswers, {
      checkId,
      answers: {
        safe: bool(args.safe),
        location: text(args.location),
        injured: bool(args.injured),
        lifeThreat: bool(args.life_threat),
        needsHelpMoving: bool(args.needs_help_moving),
        othersNearby: text(args.others_nearby),
      },
    });
    return json({ closing_line: result.closingLine });
  }),
});

// Retell sends { event, call }. This webhook cannot carry a custom header, so
// nothing here is trusted on its own: the mutations only act when the call id
// matches the one Convex stored for that check when it placed the call.
http.route({
  path: "/retell/events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { event, call } = await request.json();
    const checkId = call?.metadata?.checkId as Id<"checks"> | undefined;
    const callId = call?.call_id as string | undefined;

    // The confirmation call's line is a template, so it is not scanned.
    if (!checkId || !callId || call.metadata.kind !== "checkin") {
      return json({ ok: true });
    }

    if (event === "transcript_updated") {
      const transcript = transcriptOf(call);
      if (transcript) {
        await ctx.runMutation(internal.checks.updateTranscript, {
          checkId,
          callId,
          transcript,
        });
      }
    } else if (event === "call_ended") {
      await ctx.runMutation(internal.checks.finishCall, {
        checkId,
        callId,
        noAnswer:
          call.call_status === "not_connected" ||
          NO_ANSWER_REASONS.has(call.disconnection_reason),
        transcript: transcriptOf(call),
        agentSpeech: agentSpeechOf(call.transcript_object),
      });
    }
    return json({ ok: true });
  }),
});

export default http;
