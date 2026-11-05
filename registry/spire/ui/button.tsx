import type { ComponentProps } from "react";
import { Slot } from "radix-ui";
import { cn } from "../lib/cn";

const variants = {
  primary: "bg-spire-gold text-spire-bg border-spire-gold hover:brightness-110",
  secondary: "bg-spire-panel text-spire-ink border-spire-panel-edge hover:border-spire-gold",
  ghost: "bg-transparent text-spire-ink border-transparent hover:bg-spire-panel",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
  lg: "h-12 px-6 text-lg",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  asChild = false,
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(
        "font-spire-display inline-flex items-center justify-center gap-2 rounded-md border tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spire-energy disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
