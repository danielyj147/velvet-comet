"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pokémon-style holographic card. Tracks the pointer over the card and sets CSS
 * custom properties the `.holo` styles read: --mx/--my (glare position), --rx/--ry
 * (3D tilt), --holo-opacity (sheen strength). Pure CSS does the rendering; this
 * just feeds it coordinates. Resets on leave.
 */
export function HoloCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = React.useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height; // 0..1
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.setProperty("--rx", `${(px - 0.5) * 10}deg`); // tilt around Y
    el.style.setProperty("--ry", `${(0.5 - py) * 10}deg`); // tilt around X
    el.style.setProperty("--holo-opacity", "1");
  };

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--holo-opacity", "0");
  };

  // Quick sparkle-burst on click: toggle the animation class, then remove it so it
  // can re-fire next time.
  const pop = (e: React.PointerEvent<HTMLDivElement>) => {
    onMove(e);
    const el = ref.current;
    if (!el) return;
    el.classList.remove("holo-pop");
    void el.offsetWidth; // reflow so the animation restarts
    el.classList.add("holo-pop");
    window.setTimeout(() => el.classList.remove("holo-pop"), 480);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onPointerDown={pop}
      className={cn(
        "holo rounded-xl border bg-[var(--surface)] p-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
