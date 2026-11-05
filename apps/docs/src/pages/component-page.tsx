import { useParams } from "react-router";
import { CodeBlock } from "../code-block";
import { COMPONENTS } from "../components-docs";
import { Preview } from "../preview";
import { NotFound } from "./not-found";

export function ComponentPage() {
  const { slug } = useParams();
  const doc = COMPONENTS.find((c) => c.slug === slug);
  if (!doc) return <NotFound />;
  const { Demo } = doc;
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-spire-display text-3xl font-bold">{doc.name}</h1>
        <p className="mt-2 max-w-2xl text-spire-muted">{doc.summary}</p>
      </div>
      <Preview title="Out of the box" note="Original fallback art. No setup." testId="preview-default"><Demo /></Preview>
      <Preview title="With your game's art" note="Wrapped in SpireAssets with the extracted example icons." testId="preview-art" art><Demo /></Preview>
      <section className="min-w-0">
        <h2 className="font-spire-display text-xl font-bold">Install</h2>
        <div className="mt-2"><CodeBlock label="Install command">{`npx shadcn@latest add https://brian-gates.github.io/spire-ui/r/spire-${doc.slug}.json`}</CodeBlock></div>
        <h2 className="font-spire-display mt-6 text-xl font-bold">Usage</h2>
        <div className="mt-2"><CodeBlock label="Usage">{doc.usage}</CodeBlock></div>
      </section>
    </div>
  );
}
