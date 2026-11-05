import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Served from https://brian-gates.github.io/spire-ui/. The docs import the registry sources directly, so what the
// pages render is exactly what `shadcn add` installs.
export default defineConfig({
  base: "/spire-ui/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@spire": fileURLToPath(new URL("../../registry/spire", import.meta.url)) } },
  server: { fs: { allow: ["../.."] } },
});
