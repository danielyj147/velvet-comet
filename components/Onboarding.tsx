"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Search, ListChecks, Command } from "lucide-react";

const KEY = "searchtrace.onboarded.v1";

const STEPS = [
  { icon: Search, text: "Type a query → get a ranked answer and the full pipeline behind it." },
  { icon: ListChecks, text: "Every result shows why it surfaced — BM25 · semantic · consensus — and what to tweak." },
  { icon: Command, text: "Press ⌘K anytime to find a result, jump to it, or change settings." },
];

/**
 * First-visit nudge. Fades in a beat after the page settles (not a hard block),
 * remembers "don't show again" in localStorage, and never reappears once dismissed.
 * The interface is meant to be obvious without it — this is a gentle head start.
 */
export function Onboarding() {
  const [open, setOpen] = React.useState(false);
  const [dontShow, setDontShow] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined" || localStorage.getItem(KEY)) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    if (dontShow) localStorage.setItem(KEY, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">See why, not just what</DialogTitle>
        <p className="mt-1 text-sm text-[var(--muted)]">
          A 10-second tour. You probably won&apos;t need it.
        </p>
        <ul className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 rounded-md bg-[var(--surface-2)] p-1.5 text-[var(--primary)]">
                <s.icon className="h-4 w-4" />
              </span>
              <span className="text-sm">{s.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
            Don&apos;t show this again
          </label>
          <Button size="sm" onClick={close}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
