// Owner: backend (voice)
// Served at https://<deployment-name>.convex.site
import { httpRouter } from "convex/server";

const http = httpRouter();

// TODO POST /retell/tool   - the save_answers tool call. Check the
//      x-rollcall-secret header, call internal.checks.recordAnswers,
//      reply with { closing_line }.
// TODO POST /retell/events - call_ended (and transcript_updated).
//      Call internal.checks.finishCall.

export default http;
