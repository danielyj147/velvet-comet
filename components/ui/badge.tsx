import * as React from "react";
import { cn } from "@/lib/utils";

/** Small pill. Pass a color via the `style` color/borderColor for status tints. */
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      {...props}
    />
  );
}
