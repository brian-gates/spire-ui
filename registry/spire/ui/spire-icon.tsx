import { useState } from "react";
import { FallbackIcon, fallbackKeyFor } from "../icons/fallback";
import { cn } from "../lib/cn";
import { useSpireAsset } from "../lib/assets-provider";

/**
 * A game icon from the asset manifest, or its fallback glyph. With several extracted sizes the
 * browser picks one for the rendered size and pixel density: `sizes` defaults to `${size}px`;
 * pass your own (e.g. "(max-width: 480px) 90vw, 320px") when CSS draws the icon at another size.
 */
export function SpireIcon(props: { id: string; size?: number; sizes?: string; tint?: string; className?: string }) {
  const { id, size = 32, sizes, tint, className } = props;
  const asset = useSpireAsset(id);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Per-instance state keyed by src: a broken image only affects this icon.

  if (asset.source === "extracted" && failedSrc !== asset.src) {
    return (
      // loading, sizes and srcSet come before src: browsers may start a fetch as soon as src is set.
      <img
        loading="lazy"
        width={size}
        height={size}
        {...(asset.srcSet ? { sizes: sizes ?? `${size}px`, srcSet: asset.srcSet } : {})}
        src={asset.src}
        alt={asset.name}
        className={cn(className)}
        onError={() => setFailedSrc(asset.src)}
      />
    );
  }
  const k = asset.source === "fallback" ? asset.fallback : fallbackKeyFor(id);
  return (
    <span className={cn("inline-block", className)} style={{ display: "inline-block", width: size, height: size, fontSize: size, lineHeight: 0 }}>
      <FallbackIcon k={k} tint={tint} title={asset.name} />
    </span>
  );
}
