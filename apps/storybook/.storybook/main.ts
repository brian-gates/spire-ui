import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig } from "vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  core: { disableTelemetry: true },
  stories: ["../stories/**/*.stories.tsx"],
  viteFinal: (config) =>
    mergeConfig(config, {
      plugins: [tailwindcss()],
      server: { fs: { allow: ["../.."] } },
    }),
};
export default config;
