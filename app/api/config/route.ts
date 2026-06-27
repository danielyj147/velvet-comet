import { NextResponse } from "next/server";
import { aiConfig } from "../../../searchtrace/config";

export const runtime = "nodejs";

/** Tells the UI whether the AI toggle should be enabled, and why not if disabled. */
export async function GET() {
  return NextResponse.json(aiConfig());
}
