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
  const [trace, setTrace] = React.useState<RunTrace | null>(null);
  const [running, setRunning] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/flows").then((r) => r.json()).then(setFlows).catch(() => {});
  }, []);

  const run = React.useCallback(async (flowName: string) => {
    setRunning(flowName);
    setError(null);
    setTrace(null);
    try {
      const res = await fetch("/api/flows/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flowName }) });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "run failed");
      setTrace(json as RunTrace);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(null);
    }
  }, []);

  const commands = React.useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = flows.map((f) => ({ id: `run-${f.name}`, group: "Actions", label: `Run flow: ${f.name}`, hint: `${f.stepCount} steps`, perform: () => void run(f.name) }));
    if (trace?.failedStepIndex != null)
      cmds.push({ id: "jump-failed", group: "Results", label: `Jump to failed step (${trace.failedStepIndex})`, perform: () => document.getElementById(`step-${trace.failedStepIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }) });
    return cmds;
  }, [flows, trace, run]);
  useCommandRegister(commands, [commands]);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-2">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Flows</h3>
          {flows.map((f) => (
            <div key={f.name} className="rounded-xl border bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{f.name}</strong>
                <Button size="sm" variant="outline" disabled={!!running} onClick={() => run(f.name)}>
                  {running === f.name ? "running…" : "run"}
                </Button>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">{f.description}</p>
              <span className="text-[11px] text-[var(--muted)]">{f.stepCount} steps</span>
            </div>
          ))}
          {flows.length === 0 && <div className="text-sm text-[var(--muted)]">No flows found.</div>}
        </aside>

        <div>
          {error && <div className="rounded-lg border border-[var(--red)] bg-[var(--surface)] p-3 text-sm text-[var(--red)]">Error: {error}</div>}
          {!trace && !error && (
            <div className="mt-16 text-center text-[var(--muted)]">
              {running ? "Running the flow… (a live browser session)" : "Run a flow to see exactly which step failed, why, and the page at that moment."}
            </div>
          )}
          {trace && <TraceView trace={trace} />}
        </div>
      </div>
    </main>
  );
}

function TraceView({ trace }: { trace: RunTrace }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-lg font-semibold">{trace.flowName}</h3>
        <Badge style={{ color: STATUS_COLOR[trace.status], borderColor: STATUS_COLOR[trace.status] }}>{trace.status}</Badge>
        {trace.failedStepIndex != null && <span className="text-xs text-[var(--red)]">failed at step {trace.failedStepIndex}</span>}
      </div>
      <div className="space-y-2">
        {trace.steps.map((s) => <StepRow key={s.index} step={s} />)}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: StepEvent }) {
  return (
    <div id={`step-${step.index}`} className={cn("rounded-xl border bg-[var(--surface)] p-3 scroll-mt-20", step.status === "skipped" && "opacity-50")}>
      <div className="flex items-center gap-3 text-sm">
        <span style={{ color: stepColor(step.status) }} className="w-4 text-center">{ICON[step.status]}</span>
        <span className="w-4 text-[var(--muted)]">{step.index}</span>
        <span className="flex-1">{step.label}</span>
        <Badge className="text-[var(--muted)]">{step.type}</Badge>
        <span className="w-14 text-right tabular-nums text-[var(--muted)]">{step.durationMs != null ? `${step.durationMs}ms` : ""}</span>
      </div>
      {step.failure && (
        <div className="mt-3 rounded-lg border border-[var(--red)] bg-[var(--surface-2)] p-3">
          <Badge style={{ color: "var(--red)", borderColor: "var(--red)" }}>{step.failure.reason}</Badge>
          <p className="mt-2 text-sm">{step.failure.message}</p>
          {step.failure.url && <p className="mt-1 text-xs text-[var(--muted)]">URL: <code>{step.failure.url}</code></p>}
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
