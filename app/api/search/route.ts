import { NextRequest, NextResponse } from "next/server";
import { runAndSave } from "../../../searchtrace/run";
import { searchRequest } from "../../../searchtrace/types";
import { aiConfig } from "../../../searchtrace/config";

// The pipeline drives a real browser-free federation but can run many calls in
// "thorough" mode, so give it room.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = searchRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  // Honor the user's AI toggle, but the server config has final say (a deploy can
  // hard-disable models regardless of what the client requests).
  const requestedAI = (body as { useAI?: boolean })?.useAI === true;
  const useModels = aiConfig().allowed && requestedAI;
  // A live search is also saved as a session, so it shows up in the studio next to
  // the nightly batch runs. `save:false` skips it (e.g. throwaway queries).
  const save = (body as { save?: boolean })?.save !== false;
  try {
    const { trace, sessionId } = await runAndSave(parsed.data, { useModels, save });
    return NextResponse.json({ trace, sessionId });
  } catch (err) {
    console.error("[api/search] failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
