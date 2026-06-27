/**
 * CLI surface for the search pipeline — prints the trace so the funnel, the
 * coverage (recall + precision + diversity), and per-result provenance are all
 * visible at a glance. The same runSearch() powers the web viewer.
 *
 *   npx tsx searchtrace/demo.ts "your query"
 *   npx tsx searchtrace/demo.ts "competitor pricing 2026" --tier thorough --diversity 0.5 \
 *       --domains techcrunch.com,theinformation.com --minRelevance 0.1
 */
import "dotenv/config";
import { runSearch } from "./pipeline.js";
import type { SearchSource, Tier } from "./types.js";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const query = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "reciprocal rank fusion";
const tier = (arg("--tier") as Tier) ?? "balanced";
const diversity = arg("--diversity") ? Number(arg("--diversity")) : 0.3;
const minRelevance = arg("--minRelevance") ? Number(arg("--minRelevance")) : 0;
const domains = arg("--domains")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const sources = (arg("--sources")?.split(",") as SearchSource[]) ?? ["web"];
const categories = arg("--categories")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

const bar = (n: number, max: number, width = 24) =>
  "█".repeat(Math.round((n / Math.max(max, 1)) * width)).padEnd(width, "·");

async function main() {
  console.log(`\nquery: "${query}"   tier: ${tier}   diversity: ${diversity}   minRelevance: ${minRelevance}\n`);

  const useModels = !process.argv.includes("--no-ai");
  const trace = await runSearch(
    {
      query,
      tier,
      sources,
      categories,
      nicheDomains: domains,
      diversity,
      minRelevance,
      topK: Number(arg("--topK") ?? 15),
      limit: Number(arg("--limit") ?? 10),
    },
    { useModels },
  );

  console.log("PIPELINE");
  const maxCount = Math.max(...trace.stages.map((s) => Math.max(s.countIn, s.countOut)));
  for (const s of trace.stages) {
    console.log(
      `  ${s.name.padEnd(20)} ${String(s.countIn).padStart(4)} → ${String(s.countOut).padStart(4)}  ` +
        `${bar(s.countOut, maxCount)}  ${s.ms}ms  ${s.note ?? ""}`,
    );
  }

  const c = trace.coverage;
  console.log("\nCOVERAGE");
  console.log(`  recall pool:     ${c.candidatesFound} hits → ${c.uniqueAfterDedup} unique (${c.duplicatesCollapsed} dup collapsed)`);
  console.log(`  precision:       mean relevance ${c.meanRelevance.toFixed(2)}  (dropped ${c.droppedLowRelevance} below gate)`);
  console.log(`  diversity:       ${c.uniqueDomains} domains, index ${c.diversityIndex.toFixed(2)} (1.0 = all distinct)`);
  console.log(`  lists federated: ${trace.lists.join(", ")}`);
  console.log(`  expansions:      ${trace.expansions.map((e) => `"${e}"`).join(", ")}`);

  if (trace.hints.length) {
    console.log("\nHINTS");
    for (const h of trace.hints) console.log(`  • ${h}`);
  }

  console.log(`\nRESULTS (${trace.results.length})`);
  for (const r of trace.results) {
    console.log(
      `  ${String(r.finalRank).padStart(2)}. [rel ${r.relevance.toFixed(2)}] ${r.title.slice(0, 70)}`,
    );
    console.log(`      ${r.domain}  —  ${r.why}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("search demo failed:", err);
  process.exit(1);
});
