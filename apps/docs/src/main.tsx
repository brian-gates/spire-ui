import "@fontsource/kreon/latin-400.css";
import "@fontsource/kreon/latin-700.css";
import "@fontsource/spectral/latin-400.css";
import "@fontsource/spectral/latin-700.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    {/* BASE_URL is "/spire-ui/"; BrowserRouter wants it without the trailing slash. */}
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Routes are prerendered, so hydrate them. 404.html is prerendered for a made-up path but served for any
// unknown URL, so its markup can legitimately differ from what the client renders: render fresh instead.
if (root.hasChildNodes() && !root.hasAttribute("data-client-render")) hydrateRoot(root, app);
else createRoot(root).render(app);
