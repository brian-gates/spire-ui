import { Link } from "react-router";
import { CodeBlock } from "../code-block";
import { Preview } from "../preview";
import { RunRowDemo } from "../components-docs";

export function Home() {
  return (
    <>
      <h1 className="font-spire-display text-4xl font-bold">Spire UI</h1>
      <p className="mt-3 max-w-2xl text-lg">
        A dark slate-teal React and Tailwind v4 component kit for run trackers, deck viewers and companion apps. Copy the
        pieces you want into your project with shadcn; they are yours to edit.
      </p>
      <p className="mt-3 max-w-2xl text-spire-muted">
        It ships with original fallback icons and free fonts, so everything looks right with no game files. If you own
        the game, a small CLI can extract its icons on your machine and the components pick them up.
      </p>
      <div className="mt-6 max-w-2xl"><CodeBlock label="Install command">{"npx shadcn@latest add https://brian-gates.github.io/spire-ui/r/spire-run-row.json"}</CodeBlock></div>
      <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Link to="/install">Install guide</Link>
        <Link to="/components">Browse components</Link>
        <Link to="/extract-art">Use your game's art</Link>
      </p>
      <div className="mt-8 grid gap-6">
        <Preview title="Out of the box" note="Original fallback art, no setup." testId="preview-default"><RunRowDemo /></Preview>
        <Preview title="With your game's art" note="The same component once a manifest is provided." testId="preview-art" art><RunRowDemo /></Preview>
      </div>
    </>
  );
}
