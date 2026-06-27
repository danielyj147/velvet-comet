"use client";

import * as React from "react";
import { useCommandRegister, type Cmd } from "../command/CommandProvider";
import type { RunTrace, StepEvent } from "../../tracewright/types";

interface FlowSummary {
  name: string;
  description?: string;
  stepCount: number;
}

const ICON: Record<StepEvent["status"], string> = {
  pending: "○",
  running: "◐",
  passed: "✔",
  failed: "✗",
  skipped: "–",
};
const STATUS_COLOR: Record<string, string> = {
  passed: "var(--green)",
  failed: "var(--red)",
  partial: "var(--amber)",
  running: "var(--blue)",
};

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
      const res = await fetch("/api/flows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowName }),
      });
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
    const cmds: Cmd[] = flows.map((f) => ({
      id: `run-${f.name}`,
      group: "Actions",
      label: `Run flow: ${f.name}`,
      hint: `${f.stepCount} steps`,
      perform: () => void run(f.name),
    }));
    if (trace?.failedStepIndex != null) {
      cmds.push({
        id: "jump-failed",
        group: "Results",
        label: `Jump to failed step (${trace.failedStepIndex})`,
        perform: () => document.getElementById(`step-${trace.failedStepIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      });
    }
    return cmds;
  }, [flows, trace, run]);
  useCommandRegister(commands, [commands]);

  return (
    <main className="page">
      <div className="split">
        <div>
          <div className="panel">
            <h3>Flows</h3>
            {flows.map((f) => (
              <div key={f.name} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong>{f.name}</strong>
                  <button className="chip on" disabled={!!running} onClick={() => run(f.name)}>
                    {running === f.name ? "running…" : "run"}
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{f.description}</div>
                <div className="muted" style={{ fontSize: 11 }}>{f.stepCount} steps</div>
              </div>
            ))}
            {flows.length === 0 && <div className="muted">No flows found.</div>}
          </div>
        </div>

        <div>
          {error && <div className="hint" style={{ borderColor: "var(--red)" }}>Error: {error}</div>}
          {!trace && !error && (
            <div className="empty">
              Run a flow to see the step-by-step trace. A failure shows exactly which step,
              why, and the page at that moment. Press ⌘K to run a flow.
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>{trace.flowName}</h3>
        <span className="relpill" style={{ color: STATUS_COLOR[trace.status], borderColor: STATUS_COLOR[trace.status] }}>
          {trace.status}
        </span>
        {trace.failedStepIndex != null && (
          <span style={{ color: "var(--red)", fontSize: 12 }}>failed at step {trace.failedStepIndex}</span>
        )}
      </div>
      {trace.steps.map((s) => (
        <StepRow key={s.index} step={s} />
      ))}
    </div>
  );
}

function StepRow({ step }: { step: StepEvent }) {
  const color = step.status === "passed" ? "var(--green)" : step.status === "failed" ? "var(--red)" : "var(--muted)";
  return (
    <div id={`step-${step.index}`} className="result" style={{ opacity: step.status === "skipped" ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color, width: 16 }}>{ICON[step.status]}</span>
        <span className="muted" style={{ width: 16 }}>{step.index}</span>
        <span style={{ flex: 1 }}>{step.label}</span>
        <span className="chip">{step.type}</span>
        <span className="muted" style={{ minWidth: 56, textAlign: "right" }}>
          {step.durationMs != null ? `${step.durationMs}ms` : ""}
        </span>
      </div>
      {step.failure && (
        <div className="panel" style={{ borderColor: "var(--red)", marginTop: 8 }}>
          <span className="relpill" style={{ color: "var(--red)", borderColor: "var(--red)" }}>{step.failure.reason}</span>
          <p style={{ margin: "8px 0" }}>{step.failure.message}</p>
          {step.failure.url && <p className="muted" style={{ fontSize: 12 }}>URL: <code>{step.failure.url}</code></p>}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginTop: 8 }}>
            {step.failure.screenshotPath && (
              <a href={step.failure.screenshotPath} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.failure.screenshotPath} alt="page at failure" style={{ maxWidth: 460, border: "1px solid var(--border)", borderRadius: 6 }} />
              </a>
            )}
            {step.failure.domSnapshotPath && (
              <a href={step.failure.domSnapshotPath} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
                view DOM snapshot ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
