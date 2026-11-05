import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig } from "vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
  stories: ["../stories/**/*.stories.tsx"],
  // Curated example art, served at ./game-examples for the "Game art" toolbar toggle. Never part of the registry or CLI.
  staticDirs: [{ from: "../../docs/public/game-examples", to: "/game-examples" }],
  viteFinal: (config) =>
    mergeConfig(config, {
      plugins: [tailwindcss()],
      server: { fs: { allow: ["../.."] } },
    }),
};
export default config;
