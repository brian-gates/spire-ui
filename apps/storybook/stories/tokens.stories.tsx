import type { Meta, StoryObj } from "@storybook/react-vite";

const COLORS = [
  "spire-bg", "spire-panel", "spire-panel-edge", "spire-ink", "spire-muted", "spire-gold", "spire-hp", "spire-energy",
  "class-ironclad", "class-silent", "class-defect", "class-regent", "class-necrobinder",
  "rarity-common", "rarity-uncommon", "rarity-rare", "rarity-boss", "rarity-event", "rarity-starter",
];

function Tokens() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {COLORS.map((c) => (
          <div key={c} className="flex flex-col gap-1">
            <div className="h-14 rounded-md border border-spire-panel-edge" style={{ background: `var(--color-${c})` }} />
            <code className="text-xs text-spire-ink">--color-{c}</code>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <code className="text-xs text-spire-muted">--font-spire-display (Kreon)</code>
          <p className="font-spire-display text-3xl tracking-wide">The Spire Awaits, 0123456789</p>
        </div>
        <div>
          <code className="text-xs text-spire-muted">--font-spire-body (Spectral)</code>
          <p className="font-spire-body text-xl">Deal 6 damage. Gain 1 Energy. The quick brown fox.</p>
        </div>
      </div>
    </div>
  );
}

const meta = { title: "Foundations/Tokens", component: Tokens, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Tokens>;
export default meta;
export const Overview: StoryObj<typeof meta> = {};
