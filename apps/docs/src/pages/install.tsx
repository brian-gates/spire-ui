import { CodeBlock } from "../code-block";

export function Install() {
  return (
    <div className="max-w-3xl">
      <h1 className="font-spire-display text-3xl font-bold">Install</h1>
      <p className="mt-3">
        Spire UI is a <a href="https://ui.shadcn.com/docs/registry">shadcn registry</a>: you copy components into your own
        source tree instead of depending on a package. It needs React 19 and Tailwind CSS v4.
      </p>

      <h2 className="font-spire-display mt-8 text-xl font-bold">1. Set up shadcn</h2>
      <p className="mt-2">If your project does not use shadcn yet:</p>
      <div className="mt-2"><CodeBlock>{"npx shadcn@latest init --base radix"}</CodeBlock></div>
      <p className="mt-2 text-spire-muted">
        Choose the <code>radix</code> base. Spire UI is built on Radix; with the Base UI base, shadcn rewrites{" "}
        <code>asChild</code> to <code>render</code> while adding components and the tooltips stop compiling.
      </p>

      <h2 className="font-spire-display mt-8 text-xl font-bold">2. Add a component</h2>
      <p className="mt-2">
        Each item pulls in what it needs: the theme, the <code>cn</code> helper, the icon set and any other components it
        is built from.
      </p>
      <div className="mt-2"><CodeBlock>{"npx shadcn@latest add https://brian-gates.github.io/spire-ui/r/spire-run-row.json"}</CodeBlock></div>
      <p className="mt-2 text-spire-muted">
        Registry URLs have the form <code>https://brian-gates.github.io/spire-ui/r/spire-&lt;name&gt;.json</code>. Each
        component page lists its own command. The theme alone is <code>spire-theme</code>.
      </p>

      <h2 className="font-spire-display mt-8 text-xl font-bold">3. Import the theme and fonts</h2>
      <p className="mt-2">
        The theme is a Tailwind v4 CSS file installed at <code>styles/spire.css</code> (shadcn&apos;s <code>~</code> is the project root in a Vite app). Import
        it after Tailwind, with a path relative to your CSS file:
      </p>
      <div className="mt-2"><CodeBlock>{`@import "tailwindcss";\n@import "../styles/spire.css";`}</CodeBlock></div>
      <p className="mt-2">
        Fonts are Kreon (display) and Spectral (body), both SIL Open Font License. Load them yourself, for example with
        Fontsource:
      </p>
      <div className="mt-2"><CodeBlock>{"npm install @fontsource/kreon @fontsource/spectral"}</CodeBlock></div>

      <h2 className="font-spire-display mt-8 text-xl font-bold">4. Use it</h2>
      <div className="mt-2">
        <CodeBlock>{`import { RunRow } from "../lib/spire/game/run-row";\n\n<RunRow run={run} />`}</CodeBlock>
      </div>
      <p className="mt-2 text-spire-muted">
        Components are installed under <code>lib/spire/</code> next to <code>src/</code> in a Vite app, so import them by
        relative path. Without a game-art manifest every icon uses the original fallback set.
      </p>
    </div>
  );
}
