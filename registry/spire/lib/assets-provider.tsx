import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { parseManifest, resolveAsset, type Resolved, type SpireManifest } from "./assets";

interface Ctx { base: string; manifest: SpireManifest | null }
const SpireAssetsContext = createContext<Ctx>({ base: "", manifest: null });

const loads = new Map<string, Promise<SpireManifest | null>>();
const loaded = new Map<string, SpireManifest | null>();

/** Clears the per-URL manifest cache (for tests). */
export function resetManifestCache(): void {
  loads.clear();
  loaded.clear();
}

function loadManifest(url: string): Promise<SpireManifest | null> {
  let p = loads.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const m = parseManifest(await res.json());
        if (!m) throw new Error("invalid manifest or unsupported schemaVersion");
        return m;
      } catch (e) {
        console.warn(`[spire-ui] could not load asset manifest ${url}; using fallback icons.`, e);
        return null;
      }
    })().then((m) => {
      loaded.set(url, m);
      return m;
    });
    loads.set(url, p);
  }
  return p;
}

export function SpireAssets(props: { base: string; manifest?: SpireManifest; manifestUrl?: string; children: ReactNode }) {
  const { base, manifest: given, manifestUrl, children } = props;
  const [fetched, setFetched] = useState<SpireManifest | null>(() =>
    manifestUrl ? (loaded.get(manifestUrl) ?? null) : null,
  );
  useEffect(() => {
    if (given || !manifestUrl) return;
    let live = true;
    loadManifest(manifestUrl).then((m) => live && setFetched(m));
    return () => { live = false; };
  }, [given, manifestUrl]);
  const manifest = given ?? fetched;
  const value = useMemo(() => ({ base, manifest }), [base, manifest]);
  return <SpireAssetsContext.Provider value={value}>{children}</SpireAssetsContext.Provider>;
}

export function useSpireAsset(id: string): Resolved {
  const { base, manifest } = useContext(SpireAssetsContext);
  return useMemo(() => resolveAsset(id, manifest, base), [id, manifest, base]);
}
