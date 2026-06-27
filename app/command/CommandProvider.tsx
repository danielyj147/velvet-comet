"use client";

import { Command } from "cmdk";
import { createContext } from "react";
import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Global Cmd+K command palette. Pages register their own commands (toggles, jumps
 * to results, run actions) via useCommandRegister; the palette always carries
 * navigation. cmdk handles the fuzzy "search everything" filtering across every
 * registered command, so one keystroke gets you to any result or setting.
 */
export interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  perform: () => void;
}

interface Ctx {
  register: (cmds: Cmd[]) => () => void;
  openPalette: () => void;
}

const CommandCtx = createContext<Ctx | null>(null);

export function useCommands(): Ctx {
  const c = React.useContext(CommandCtx);
  if (!c) throw new Error("useCommands must be used within CommandProvider");
  return c;
}

/** Register a set of commands for the lifetime of the deps. */
export function useCommandRegister(cmds: Cmd[], deps: React.DependencyList): void {
  const { register } = useCommands();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => register(cmds), deps);
}

const GROUP_ORDER = ["Results", "Settings", "Actions", "Navigate"];

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [groups, setGroups] = React.useState<Record<string, Cmd[]>>({});
  const counter = React.useRef(0);

  const register = React.useCallback((cmds: Cmd[]) => {
    const key = `g${++counter.current}`;
    setGroups((g) => ({ ...g, [key]: cmds }));
    return () =>
      setGroups((g) => {
        const next = { ...g };
        delete next[key];
        return next;
      });
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav: Cmd[] = React.useMemo(
    () => [
      { id: "nav-search", group: "Navigate", label: "Go to Search", perform: () => router.push("/search") },
      { id: "nav-flows", group: "Navigate", label: "Go to Flows", perform: () => router.push("/flows") },
      { id: "nav-home", group: "Navigate", label: "Go Home", perform: () => router.push("/") },
    ],
    [router],
  );

  const all = React.useMemo(() => [...Object.values(groups).flat(), ...nav], [groups, nav]);
  const groupNames = React.useMemo(() => {
    const seen = new Set(all.map((c) => c.group));
    const ordered = GROUP_ORDER.filter((g) => seen.has(g));
    for (const g of seen) if (!ordered.includes(g)) ordered.push(g);
    return ordered;
  }, [all]);

  const run = (c: Cmd) => {
    setOpen(false);
    c.perform();
  };

  return (
    <CommandCtx.Provider value={{ register, openPalette: () => setOpen(true) }}>
      {children}
      <Command.Dialog open={open} onOpenChange={setOpen} className="cmdk-dialog" label="Command palette">
        <Command.Input placeholder="Search results, jump, or toggle settings…" autoFocus />
        <Command.List>
          <Command.Empty>No matches.</Command.Empty>
          {groupNames.map((g) => (
            <Command.Group key={g} heading={g}>
              {all
                .filter((c) => c.group === g)
                .map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.group} ${c.label} ${c.keywords ?? ""}`}
                    onSelect={() => run(c)}
                  >
                    <span>{c.label}</span>
                    {c.hint && <span className="sub">{c.hint}</span>}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </CommandCtx.Provider>
  );
}
