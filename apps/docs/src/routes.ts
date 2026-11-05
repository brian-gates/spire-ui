import { COMPONENTS } from "./components-docs";

/** Public origin plus base path. Canonical URLs, the sitemap and Open Graph tags are absolute against this. */
export const SITE = "https://brian-gates.github.io/spire-ui/";
export const SITE_NAME = "Spire UI";

export interface RouteMeta {
  /** Path under the base, without slashes at the ends. Empty for the home page. */
  path: string;
  title: string;
  description: string;
}

/** Every indexable docs route. Each is prerendered to `<path>/index.html` at build time. */
export const ROUTES: readonly RouteMeta[] = [
  {
    path: "",
    title: "Spire UI: a dark slate-teal React and Tailwind component kit",
    description: "Spire UI is a dark slate-teal React and Tailwind v4 component kit for run trackers, deck viewers and companion apps, distributed as a shadcn registry.",
  },
  {
    path: "install",
    title: "Install | Spire UI",
    description: "Install Spire UI components into your project with shadcn: set up the registry, add a component, import the theme and fonts, and use it.",
  },
  {
    path: "extract-art",
    title: "Use your game's art | Spire UI",
    description: "Extract icons from your own copy of the game on your machine with the Spire UI CLI so the components pick them up. No game files are shipped.",
  },
  {
    path: "components",
    title: "Components | Spire UI",
    description: "Every Spire UI component with a live preview, install command and usage example, shown with fallback art and with extracted game art.",
  },
  ...COMPONENTS.map((c) => ({
    path: `components/${c.slug}`,
    title: `${c.name} | Spire UI`,
    description: `${c.summary} Install with shadcn and see usage and live previews.`,
  })),
];

export const absoluteUrl = (path: string) => (path ? `${SITE}${path}/` : SITE);
