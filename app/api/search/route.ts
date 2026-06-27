import { NextRequest, NextResponse } from "next/server";
import { runSearch } from "../../../searchtrace/pipeline";
import { searchRequest } from "../../../searchtrace/types";

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
  try {
    const trace = await runSearch(parsed.data);
    return NextResponse.json(trace);
  } catch (err) {
    console.error("[api/search] failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
