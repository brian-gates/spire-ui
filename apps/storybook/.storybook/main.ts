import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

// Your own `spire-ui extract-art --out spire-art` output at the repo root (gitignored), served at
// ./local-art for stories that show extracted pieces, by `storybook dev` only: a static build never
// copies it, so it cannot end up in the published docs.
const localArt = fileURLToPath(new URL("../../../spire-art", import.meta.url));
const serveLocalArt = !process.argv.includes("build") && existsSync(localArt);

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
  stories: ["../stories/**/*.stories.tsx"],
  // Curated example art, served at ./game-examples for the "Game art" toolbar toggle. Never part of the registry or CLI.
  staticDirs: [{ from: "../../docs/public/game-examples", to: "/game-examples" }, ...(serveLocalArt ? [{ from: "../../../spire-art", to: "/local-art" }] : [])],
  viteFinal: (config) =>
    mergeConfig(config, {
      plugins: [tailwindcss()],
      server: { fs: { allow: ["../.."] } },
    }),
};
export default config;
