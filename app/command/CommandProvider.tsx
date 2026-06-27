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
  /** If true, Shift+Enter in the palette runs this directly (e.g. "Run search"). */
  primary?: boolean;
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
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command palette"
        overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        contentClassName="fixed left-1/2 top-[14vh] z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border bg-[var(--surface)] shadow-2xl"
      >
        <Command.Input
          autoFocus
          placeholder="Search results, jump, or toggle settings…   (⇧⏎ to run a search)"
          onKeyDown={(e) => {
            // Shift+Enter runs the registered primary action (search), wherever you are.
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              const primary = all.find((c) => c.primary);
              if (primary) run(primary);
              else {
                setOpen(false);
                router.push("/search");
              }
            }
          }}
          className="w-full border-b bg-transparent px-4 py-4 text-[15px] outline-none placeholder:text-[var(--muted)]"
        />
        <Command.List className="max-h-[420px] overflow-auto p-2">
          <Command.Empty className="p-5 text-center text-sm text-[var(--muted)]">No matches.</Command.Empty>
          {groupNames.map((g) => (
            <Command.Group
              key={g}
              heading={g}
              className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] [&_[cmdk-group-items]]:mt-1"
            >
              {all
                .filter((c) => c.group === g)
                .map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.group} ${c.label} ${c.keywords ?? ""}`}
                    onSelect={() => run(c)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--foreground)] data-[selected=true]:bg-[var(--surface-2)]"
                  >
                    <span>{c.label}</span>
                    {c.hint && <span className="ml-auto text-xs text-[var(--muted)]">{c.hint}</span>}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command.Dialog>
    </CommandCtx.Provider>
  );
}
