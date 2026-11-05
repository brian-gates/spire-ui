import { useEffect, useState } from "react";
import { FallbackIcon, fallbackKeyFor } from "../icons/fallback";
import { useSpireAsset } from "../lib/assets-provider";

export function SpireIcon(props: { id: string; size?: number; tint?: string; className?: string }) {
  const { id, size = 32, tint, className } = props;
  const asset = useSpireAsset(id);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Per-instance state: a broken image only affects this icon.
  useEffect(() => setFailedSrc(null), [id]);

  if (asset.source === "extracted" && failedSrc !== asset.src) {
    return (
      <img
        src={asset.src}
        alt={asset.name}
        width={size}
        height={size}
        loading="lazy"
        className={className}
        onError={() => setFailedSrc(asset.src)}
      />
    );
  }
  const k = asset.source === "fallback" ? asset.fallback : fallbackKeyFor(id);
  return (
    <span className={className} style={{ display: "inline-block", width: size, height: size, fontSize: size, lineHeight: 0 }}>
      <FallbackIcon k={k} tint={tint} title={asset.name} />
    </span>
  );
}
