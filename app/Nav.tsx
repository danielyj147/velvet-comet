"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCommands } from "./command/CommandProvider";
import { cn } from "@/lib/utils";

export function Nav() {
  const path = usePathname();
  const { openPalette } = useCommands();
  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        path === href
          ? "bg-[var(--surface)] text-[var(--foreground)]"
          : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav className="sticky top-0 z-30 flex items-center gap-2 border-b bg-[var(--background)]/80 px-5 py-3 backdrop-blur">
      <Link href="/" className="mr-2 font-bold tracking-tight text-[var(--primary)]">
        firecrawl·traces
      </Link>
      {link("/search", "Search")}
      {link("/flows", "Flows")}
      <div className="flex-1" />
      <button
        onClick={openPalette}
        className="rounded-md border px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
        title="Command palette"
      >
        ⌘K
      </button>
    </nav>
  );
}
