import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

const variants = {
  default: "spire-panel",
  inset: "rounded-lg border border-spire-panel-edge bg-spire-bg/60 shadow-[inset_0_2px_8px_rgb(0_0_0/0.35)]",
  parchment: "spire-frame bg-spire-ink text-spire-bg",
} as const;

export function Panel({
  variant = "default",
  className,
  ...props
}: ComponentProps<"div"> & { variant?: keyof typeof variants }) {
  return <div data-slot="panel" className={cn("p-4 text-spire-ink", variants[variant], className)} {...props} />;
}
