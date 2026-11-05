import "@fontsource/kreon/latin-400.css";
import "@fontsource/kreon/latin-700.css";
import "@fontsource/spectral/latin-400.css";
import "@fontsource/spectral/latin-700.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";

// BASE_URL is "/spire-ui/"; BrowserRouter wants it without the trailing slash.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
