// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpireAssets, resetManifestCache, useSpireAsset } from "../../registry/spire/lib/assets-provider";

function Probe({ out }: { out: unknown[] }) {
  out.push(useSpireAsset("RELIC.X"));
  return null;
}

const flush = () => new Promise((r) => setTimeout(r, 20));
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetManifestCache();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const cases: [string, () => Promise<unknown>][] = [
  ["404", async () => ({ ok: false, status: 404, json: async () => ({}) })],
  ["schemaVersion 2", async () => ({ ok: true, status: 200, json: async () => ({ schemaVersion: 2 }) })],
  ["rejected fetch", async () => { throw new TypeError("network down"); }],
  ["invalid json", async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } })],
];

describe("SpireAssets", () => {
  for (const [name, impl] of cases) {
    it(`falls back and warns once on ${name}`, async () => {
      vi.stubGlobal("fetch", vi.fn(impl));
      const out: any[] = [];
      render(
        <SpireAssets base="/art" manifestUrl={`/m-${name}.json`}>
          <Probe out={out} /><Probe out={out} /><Probe out={out} />
        </SpireAssets>,
      );
      await flush();
      expect(out.at(-1)).toEqual({ source: "fallback", fallback: "relic", name: "X" });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  }

  it("resolves from loaded manifestUrl", async () => {
    const m = { schemaVersion: 1, gameVersion: "1", generatedAt: "n", items: { "RELIC.X": { kind: "relic", file: "x.png", w: 1, h: 2 } } };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => m })));
    const out: any[] = [];
    render(<SpireAssets base="/art" manifestUrl="/ok.json"><Probe out={out} /></SpireAssets>);
    expect(out[0].source).toBe("fallback");
    await flush();
    expect(out.at(-1)).toMatchObject({ source: "extracted", src: "/art/x.png" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("uses manifest prop without fetching", () => {
    vi.stubGlobal("fetch", vi.fn());
    const m = { schemaVersion: 1 as const, gameVersion: "1", generatedAt: "n", items: { "RELIC.X": { kind: "relic" as const, file: "x.png", w: 1, h: 2 } } };
    const out: any[] = [];
    render(<SpireAssets base="/art" manifest={m}><Probe out={out} /></SpireAssets>);
    expect(out[0].source).toBe("extracted");
    expect(fetch).not.toHaveBeenCalled();
  });
});
