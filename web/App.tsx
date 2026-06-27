import { useCallback, useEffect, useState } from "react";
import type { RunTrace, StepEvent } from "../src/types.js";

interface FlowSummary {
  name: string;
  description?: string;
  stepCount: number;
}
interface RunSummary {
  id: string;
  flowName: string;
  status: string;
  startedAt: number;
  failedStepIndex?: number;
}

const json = (url: string) => fetch(url).then((r) => r.json());

export function App() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trace, setTrace] = useState<RunTrace | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshRuns = useCallback(() => json("/api/runs").then(setRuns), []);

  useEffect(() => {
    json("/api/flows").then(setFlows);
    refreshRuns();
  }, [refreshRuns]);

  // Poll the selected run while it's still executing.
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const tick = async () => {
      const t: RunTrace = await json(`/api/runs/${selectedId}`);
      if (!active) return;
      setTrace(t);
      if (t.status === "running") setTimeout(tick, 700);
      else refreshRuns();
    };
    tick();
    return () => {
      active = false;
    };
  }, [selectedId, refreshRuns]);

  const run = useCallback(
    async (flowName: string) => {
      setBusy(true);
      try {
        const { runId } = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowName }),
        }).then((r) => r.json());
        setSelectedId(runId);
        setTrace(null);
        refreshRuns();
      } finally {
        setBusy(false);
      }
    },
    [refreshRuns],
  );

  return (
    <div className="app">
      <header>
        <h1>tracewright</h1>
        <span className="tag">step-level traces for Firecrawl browser flows</span>
      </header>
      <div className="cols">
        <aside>
          <h2>Flows</h2>
          {flows.map((f) => (
            <div key={f.name} className="flow">
              <div className="flow-head">
                <strong>{f.name}</strong>
                <button disabled={busy} onClick={() => run(f.name)}>
                  Run
                </button>
              </div>
              <p>{f.description}</p>
              <span className="muted">{f.stepCount} steps</span>
            </div>
          ))}

          <h2>Recent runs</h2>
          {runs.map((r) => (
            <button
              key={r.id}
              className={`run-item ${r.id === selectedId ? "active" : ""}`}
              onClick={() => setSelectedId(r.id)}
            >
              <span className={`dot ${r.status}`} />
              <span className="run-flow">{r.flowName}</span>
              <span className="muted">
                {r.failedStepIndex != null ? `failed @${r.failedStepIndex}` : r.status}
              </span>
            </button>
          ))}
        </aside>

        <main>
          {!trace ? (
            <div className="empty">Pick a flow and hit Run, or select a recent run.</div>
          ) : (
            <TraceView trace={trace} onRerun={() => run(trace.flowName)} busy={busy} />
          )}
        </main>
      </div>
    </div>
  );
}

function TraceView({
  trace,
  onRerun,
  busy,
}: {
  trace: RunTrace;
  onRerun: () => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="trace-head">
        <div>
          <h2>{trace.flowName}</h2>
          <span className={`status ${trace.status}`}>{trace.status}</span>
          {trace.failedStepIndex != null && (
            <span className="failed-at">
              failed at step {trace.failedStepIndex}
            </span>
          )}
        </div>
        <div className="actions">
          {trace.liveViewUrl && trace.status === "running" && (
            <a href={trace.liveViewUrl} target="_blank" rel="noreferrer">
              live view ↗
            </a>
          )}
          <button disabled={busy} onClick={onRerun}>
            Re-run flow
          </button>
        </div>
      </div>
      <ol className="steps">
        {trace.steps.map((s) => (
          <StepRow key={s.index} step={s} />
        ))}
      </ol>
    </>
  );
}

const ICON: Record<StepEvent["status"], string> = {
  pending: "○",
  running: "◐",
  passed: "✔",
  failed: "✗",
  skipped: "–",
};

function StepRow({ step }: { step: StepEvent }) {
  return (
    <li className={`step ${step.status}`}>
      <div className="step-line">
        <span className="step-icon">{ICON[step.status]}</span>
        <span className="step-idx">{step.index}</span>
        <span className="step-label">{step.label}</span>
        <span className="step-type">{step.type}</span>
        <span className="step-dur muted">
          {step.durationMs != null ? `${step.durationMs}ms` : ""}
        </span>
      </div>
      {step.failure && <FailurePanel step={step} />}
    </li>
  );
}

function FailurePanel({ step }: { step: StepEvent }) {
  const f = step.failure!;
  return (
    <div className="failure">
      <div className="failure-reason">{f.reason}</div>
      <p>{f.message}</p>
      {f.url && (
        <p className="muted">
          URL at failure: <code>{f.url}</code>
        </p>
      )}
      <div className="failure-artifacts">
        {f.screenshotPath && (
          <a href={f.screenshotPath} target="_blank" rel="noreferrer">
            <img src={f.screenshotPath} alt="page at moment of failure" />
          </a>
        )}
        {f.domSnapshotPath && (
          <a className="dom-link" href={f.domSnapshotPath} target="_blank" rel="noreferrer">
            view DOM snapshot ↗
          </a>
        )}
      </div>
    </div>
  );
}
