import { Link } from "react-router";
import { COMPONENTS } from "../components-docs";

export function ComponentsIndex() {
  return (
    <>
      <h1 className="font-spire-display text-3xl font-bold">Components</h1>
      <p className="mt-3 text-spire-muted">Every page shows the component without any game art, then with the curated example art.</p>
      <ul className="m-0 mt-6 grid list-none gap-3 p-0 sm:grid-cols-2">
        {COMPONENTS.map((c) => (
          <li key={c.slug} className="spire-panel p-4">
            <Link to={`/components/${c.slug}`} className="font-spire-display text-lg font-bold">{c.name}</Link>
            <p className="mt-1 text-sm text-spire-muted">{c.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
