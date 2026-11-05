import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export function Divider({ className, ...props }: ComponentProps<"hr">) {
  return (
    <hr
      data-slot="divider"
      className={cn(
        "h-px w-full border-0 bg-gradient-to-r from-transparent via-spire-gold/60 to-transparent",
        className,
      )}
      {...props}
    />
  );
}
