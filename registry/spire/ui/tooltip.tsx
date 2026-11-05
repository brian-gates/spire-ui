import type { ComponentProps } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "../lib/cn";

export function TooltipProvider({ delayDuration = 0, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props} />
    </TooltipProvider>
  );
}

export function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/** `bare`: no panel of its own, for content that draws its own (such as GameTip). Kept 8px inside the viewport by default. */
export function TooltipContent({
  className,
  sideOffset = 6,
  collisionPadding = 8,
  bare = false,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content> & { bare?: boolean }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        data-bare={bare || undefined}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          bare ? "z-50" : "spire-panel font-spire-body z-50 max-w-xs px-3 py-2 text-sm text-spire-ink",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
