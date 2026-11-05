import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { App } from "./App";

export { ROUTES, SITE, SITE_NAME, absoluteUrl } from "./routes";

/** Renders the app at `path` (under the base) to an HTML string. Used only by scripts/prerender.mjs. */
export function render(path: string): string {
  return renderToString(
    <StaticRouter basename="/spire-ui" location={`/spire-ui/${path}`}>
      <App />
    </StaticRouter>,
  );
}
