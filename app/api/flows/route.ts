import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { flow as flowSchema } from "../../../tracewright/types";

export const runtime = "nodejs";

/** List the declarative flows in flows/. */
export async function GET() {
  const dir = "flows";
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const flows = await Promise.all(
    files.map(async (f) => {
      const parsed = flowSchema.safeParse(JSON.parse(await readFile(join(dir, f), "utf8")));
      return parsed.success
        ? { name: parsed.data.name, description: parsed.data.description, stepCount: parsed.data.steps.length }
        : null;
    }),
  );
  return NextResponse.json(flows.filter(Boolean));
}
