import type { ReactNode } from "react";
import { SpireAssets } from "@spire/lib/assets-provider";

// The curated examples live in public/game-examples and are served next to the docs. They exist only to
// illustrate the components here: they are not in the registry output or in the npm package.
const EXAMPLES = `${import.meta.env.BASE_URL}game-examples`;

export function Preview(props: { title: string; note: string; testId: string; art?: boolean; children: ReactNode }) {
  const body = props.art ? (
    <SpireAssets base={EXAMPLES} manifestUrl={`${EXAMPLES}/manifest.json`}>{props.children}</SpireAssets>
  ) : (
    props.children
  );
  return (
    <section aria-labelledby={`${props.testId}-title`} className="min-w-0">
      <h2 id={`${props.testId}-title`} className="font-spire-display text-xl font-bold">{props.title}</h2>
      <p className="mb-2 text-sm text-spire-muted">{props.note}</p>
      <div data-testid={props.testId} className="min-w-0 rounded-lg border border-spire-panel-edge bg-spire-bg p-3 sm:p-4">
        {body}
      </div>
    </section>
  );
}
