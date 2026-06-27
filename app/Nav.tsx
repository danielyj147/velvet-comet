"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCommands } from "./command/CommandProvider";

export function Nav() {
  const path = usePathname();
  const { openPalette } = useCommands();
  const is = (p: string) => (path === p ? "active" : "");
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        firecrawl·traces
      </Link>
      <Link href="/search" className={is("/search")}>
        Search
      </Link>
      <Link href="/flows" className={is("/flows")}>
        Flows
      </Link>
      <span className="spacer" />
      <button className="kbd" onClick={openPalette} title="Command palette">
        ⌘K
      </button>
    </nav>
  );
}
