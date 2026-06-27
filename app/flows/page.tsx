"use client";

import * as React from "react";
import { useCommandRegister, type Cmd } from "../command/CommandProvider";
import type { RunTrace, StepEvent } from "../../tracewright/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FlowSummary {
  name: string;
  description?: string;
  stepCount: number;
}

const ICON: Record<StepEvent["status"], string> = { pending: "○", running: "◐", passed: "✔", failed: "✗", skipped: "–" };
const STATUS_COLOR: Record<string, string> = { passed: "var(--green)", failed: "var(--red)", partial: "var(--amber)", running: "var(--blue)" };
const stepColor = (s: StepEvent["status"]) => (s === "passed" ? "var(--green)" : s === "failed" ? "var(--red)" : "var(--muted)");

export default function FlowsPage() {
  const [flows, setFlows] = React.useState<FlowSummary[]>([]);
  const [seed, setSeed] = React.useState<RunTrace | null>(null);
  const [saved, setSaved] = React.useState<RunTrace[]>([]);
  const [viewing, setViewing] = React.useState<RunTrace | null>(null);
  const [running, setRunning] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [checkUrl, setCheckUrl] = React.useState("");
  const [checking, setChecking] = React.useState(false);

  const loadRuns = React.useCallback(async () => {
    const { seed, runs } = await fetch("/api/flows/runs").then((r) => r.json());
    setSeed(seed);
    setSaved(runs ?? []);
    // Default to the most recent real run, else the committed example failure.
    setViewing((v) => v ?? runs?.[0] ?? seed ?? null);
  }, []);

  React.useEffect(() => {
    fetch("/api/flows").then((r) => r.json()).then(setFlows).catch(() => {});
    loadRuns().catch(() => {});
  }, [loadRuns]);

  const run = React.useCallback(async (flowName: string) => {
    setRunning(flowName);
    setError(null);
    try {
      const res = await fetch("/api/flows/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flowName }) });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "run failed");
      setViewing(json as RunTrace);
      loadRuns().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(null);
    }
  }, [loadRuns]);

  const check = React.useCallback(async () => {
    if (!checkUrl.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/flows/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: checkUrl.trim() }) });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "check failed");
      setViewing(json as RunTrace);
      loadRuns().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }, [checkUrl, loadRuns]);

  const commands = React.useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = flows.map((f) => ({ id: `run-${f.name}`, group: "Actions", label: `Run flow: ${f.name}`, hint: `${f.stepCount} steps`, perform: () => void run(f.name) }));
    for (const r of saved)
      cmds.push({ id: `view-${r.id}`, group: "Results", label: `View run: ${r.flowName}`, hint: r.status, perform: () => setViewing(r) });
    if (viewing?.failedStepIndex != null)
      cmds.push({ id: "jump-failed", group: "Results", label: `Jump to failed step (${viewing.failedStepIndex})`, perform: () => document.getElementById(`step-${viewing.failedStepIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }) });
    return cmds;
  }, [flows, saved, viewing, run]);
  useCommandRegister(commands, [commands]);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          {/* Saved runs first: a reviewer sees a real failure instantly, no live run. */}
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Saved runs</h3>
            <div className="space-y-1.5">
              {seed && <SavedItem trace={seed} active={viewing === seed} example onClick={() => setViewing(seed)} />}
              {saved.map((r) => (
                <SavedItem key={r.id} trace={r} active={viewing?.id === r.id} onClick={() => setViewing(r)} />
              ))}
              {!seed && saved.length === 0 && <div className="text-xs text-[var(--muted)]">No saved runs yet.</div>}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Run live</h3>
            <p className="mb-2 text-[11px] text-[var(--muted)]">Uses a real Firecrawl browser session (~20s, costs credits).</p>
            {flows.map((f) => (
              <div key={f.name} className="mb-1.5 rounded-lg border bg-[var(--surface)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{f.name}</strong>
                  <Button size="sm" variant="outline" disabled={!!running} onClick={() => run(f.name)}>
                    {running === f.name ? "running…" : "run"}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-[var(--muted)]">{f.description}</p>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          {/* Check any page: paste a URL → pass/fail + the reason if it fails. */}
          <div className="mb-4 flex gap-2">
            <input
              value={checkUrl}
              onChange={(e) => setCheckUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && check()}
              placeholder="Check any page — paste a URL (e.g. example.com)"
              className="h-10 min-w-0 flex-1 rounded-lg border bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--primary)]"
            />
            <Button onClick={check} disabled={checking || !!running}>
              {checking ? "Checking…" : "Check"}
            </Button>
          </div>

          {error && <div className="mb-3 rounded-lg border border-[var(--red)] bg-[var(--surface)] p-3 text-sm text-[var(--red)]">Error: {error}</div>}
          {!viewing ? (
            <div className="mt-16 text-center text-[var(--muted)]">Check a page above, pick a saved run, or run a flow live.</div>
          ) : (
            <TraceView trace={viewing} isSeed={viewing === seed} />
          )}
        </div>
      </div>
    </main>
  );
}

function SavedItem({ trace, active, example, onClick }: { trace: RunTrace; active: boolean; example?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-lg border bg-[var(--surface)] px-2.5 py-2 text-left text-sm", active && "border-[var(--primary)]")}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[trace.status] ?? "var(--muted)" }} />
      <span className="min-w-0 flex-1 truncate">{trace.flowName}</span>
      {example && <Badge className="text-[var(--muted)]">example</Badge>}
      <span className="text-[11px] text-[var(--muted)]">{trace.failedStepIndex != null ? `@${trace.failedStepIndex}` : trace.status}</span>
    </button>
  );
}

function exportRun(trace: RunTrace) {
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flowtrace-${trace.flowName.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function TraceView({ trace, isSeed }: { trace: RunTrace; isSeed: boolean }) {
  const ok = trace.status === "passed";
  const color = ok ? "var(--green)" : "var(--red)";
  return (
    <div>
      {/* Unmissable verdict — the answer to "did this page fail or succeed?" */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: color, background: `color-mix(in oklab, ${color} 8%, transparent)` }}>
        <span className="shrink-0 text-lg" style={{ color }}>{ok ? "✔" : "✗"}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold" style={{ color }}>
            {ok ? "Loaded" : "Failed"}
            {trace.finalSnapshot?.httpStatus != null && <span className="ml-2 text-xs font-normal text-[var(--muted)]">HTTP {trace.finalSnapshot.httpStatus}</span>}
          </div>
          <div className="break-all text-xs text-[var(--muted)]">
            {trace.flowName}
            {trace.failedStepIndex != null && ` · failed at step ${trace.failedStepIndex} (${trace.steps[trace.failedStepIndex]?.failure?.reason})`}
          </div>
        </div>
        {isSeed && <Badge className="shrink-0 text-[var(--muted)]">saved example</Badge>}
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => exportRun(trace)}>Export JSON</Button>
      </div>

      {trace.finalSnapshot && <Snapshot snap={trace.finalSnapshot} />}

      <div className="space-y-2">
        {trace.steps.map((s) => <StepRow key={s.index} step={s} />)}
      </div>
    </div>
  );
}

/** What actually came back — general, site-agnostic, so the user judges soft-blocks. */
function Snapshot({ snap }: { snap: NonNullable<RunTrace["finalSnapshot"]> }) {
  return (
    <div className="mb-4 rounded-xl border bg-[var(--surface)] p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">What came back</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 text-sm">
          {snap.title && <div className="font-medium break-words">{snap.title}</div>}
          {snap.url && <div className="break-all text-xs text-[var(--blue)]">{snap.url}</div>}
          <div className="mt-1 text-xs text-[var(--muted)]">{snap.charCount.toLocaleString()} chars of text</div>
          {snap.snippet && <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-2)] p-2 text-xs text-[var(--muted)]">{snap.snippet}</p>}
        </div>
        {snap.screenshotPath && (
          <a href={snap.screenshotPath} target="_blank" rel="noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={snap.screenshotPath} alt="final page" className="max-h-40 rounded-md border" />
          </a>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: StepEvent }) {
  return (
    <div id={`step-${step.index}`} className={cn("rounded-xl border bg-[var(--surface)] p-3 scroll-mt-20", step.status === "skipped" && "opacity-50")}>
      <div className="flex items-center gap-3 text-sm">
        <span style={{ color: stepColor(step.status) }} className="w-4 shrink-0 text-center">{ICON[step.status]}</span>
        <span className="w-4 shrink-0 text-[var(--muted)]">{step.index}</span>
        <span className="min-w-0 flex-1 break-words">{step.label}</span>
        <Badge className="shrink-0 text-[var(--muted)]">{step.type}</Badge>
        <span className="w-14 shrink-0 text-right tabular-nums text-[var(--muted)]">{step.durationMs != null ? `${step.durationMs}ms` : ""}</span>
      </div>
      {step.failure && (
        <div className="mt-3 rounded-lg border border-[var(--red)] bg-[var(--surface-2)] p-3">
          <Badge style={{ color: "var(--red)", borderColor: "var(--red)" }}>{step.failure.reason}</Badge>
          <p className="mt-2 text-sm">{step.failure.message}</p>
          {step.failure.url && <p className="mt-1 break-all text-xs text-[var(--muted)]">URL: <code>{step.failure.url}</code></p>}
          <div className="mt-3 flex flex-wrap items-start gap-4">
            {step.failure.screenshotPath && (
              <a href={step.failure.screenshotPath} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.failure.screenshotPath} alt="page at failure" className="max-w-[460px] rounded-md border" />
              </a>
            )}
            {step.failure.domSnapshotPath && (
              <a href={step.failure.domSnapshotPath} target="_blank" rel="noreferrer" className="text-sm text-[var(--blue)]">view DOM snapshot ↗</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
