"use client";

import * as React from "react";

/**
 * Ambient background: blurred circles drifting upward at random sizes, speeds, and
 * offsets. Purely decorative and fixed behind everything (pointer-events: none).
 *
 * The randomness is generated AFTER mount (not during render) so the server-rendered
 * HTML is empty and there's no hydration mismatch — random values can't agree across
 * server and client. Honors prefers-reduced-motion (the .bubble CSS hides them).
 */
const TINTS = [
  "rgba(255,106,61,0.18)", // primary
  "rgba(96,165,250,0.16)", // blue
  "rgba(204,95,255,0.14)", // purple
  "rgba(52,211,153,0.12)", // green
];

interface Bubble {
  key: number;
  left: string;
  size: number;
  tint: string;
  duration: string;
  delay: string;
  opacity: number;
}

export function Bubbles({ count = 14 }: { count?: number }) {
  const [bubbles, setBubbles] = React.useState<Bubble[]>([]);

  React.useEffect(() => {
    setBubbles(
      Array.from({ length: count }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        size: 40 + Math.random() * 180,
        tint: TINTS[i % TINTS.length]!,
        duration: `${14 + Math.random() * 22}s`,
        delay: `${-Math.random() * 22}s`,
        opacity: 0.3 + Math.random() * 0.4,
      })),
    );
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {bubbles.map((b) => (
        <span
          key={b.key}
          className="bubble"
          style={
            {
              left: b.left,
              width: b.size,
              height: b.size,
              background: b.tint,
              "--bubble-duration": b.duration,
              "--bubble-delay": b.delay,
              "--bubble-opacity": b.opacity,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
