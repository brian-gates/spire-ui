import { useEffect } from "react";
import { Link, NavLink, Outlet, Route, Routes, useLocation } from "react-router";
import { COMPONENTS } from "./components-docs";
import { ComponentPage } from "./pages/component-page";
import { ComponentsIndex } from "./pages/components-index";
import { ExtractArt } from "./pages/extract-art";
import { Home } from "./pages/home";
import { Install } from "./pages/install";
import { NotFound } from "./pages/not-found";

const GITHUB = "https://github.com/brian-gates/spire-ui";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 ${isActive ? "text-spire-gold" : "text-spire-ink"} hover:text-spire-gold`;

function Layout() {
  const { pathname } = useLocation();
  // Braces matter: newer Chrome returns a Promise from scrollTo, and React would call it as cleanup.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const onComponent = pathname.includes("/components/");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-spire-panel-edge bg-spire-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="font-spire-display text-xl font-bold text-spire-gold no-underline">Spire UI</Link>
          <nav aria-label="Main" className="font-spire-display flex flex-wrap items-center gap-x-2 gap-y-1">
            <NavLink to="/install" className={navLink}>Install</NavLink>
            <NavLink to="/extract-art" className={navLink}>Extract art</NavLink>
            <NavLink to="/components" end className={navLink}>Components</NavLink>
            {/* A plain anchor: Storybook is a separate static site under the same Pages root, not a client route. */}
            <a href={`${import.meta.env.BASE_URL}storybook/`} className="rounded px-2 py-1 text-spire-ink no-underline hover:text-spire-gold">Storybook</a>
            <a href={GITHUB} className="rounded px-2 py-1 text-spire-ink no-underline hover:text-spire-gold">GitHub</a>
          </nav>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] gap-8 px-4 py-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {onComponent && (
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <details className="rounded border border-spire-panel-edge p-3 lg:hidden">
              <summary className="font-spire-display cursor-pointer">All components</summary>
              <ComponentNav />
            </details>
            <div className="hidden lg:block"><ComponentNav /></div>
          </aside>
        )}
        <main id="main" className={`min-w-0 ${onComponent ? "" : "lg:col-span-2"}`}>
          <Outlet />
        </main>
      </div>
      <footer className="border-t border-spire-panel-edge px-4 py-6 text-center text-sm text-spire-muted">Unofficial fan project, not affiliated with Mega Crit.</footer>
    </div>
  );
}

function ComponentNav() {
  return (
    <nav aria-label="Components" className="mt-3 lg:mt-0">
      <ul className="m-0 grid list-none gap-1 p-0">
        {COMPONENTS.map((c) => (
          <li key={c.slug}>
            <NavLink to={`/components/${c.slug}`} className={({ isActive }) => `block rounded px-2 py-1 no-underline ${isActive ? "bg-spire-panel text-spire-gold" : "text-spire-ink hover:text-spire-gold"}`}>
              {c.name}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="install" element={<Install />} />
        <Route path="extract-art" element={<ExtractArt />} />
        <Route path="components" element={<ComponentsIndex />} />
        <Route path="components/:slug" element={<ComponentPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
