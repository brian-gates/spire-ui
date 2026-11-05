import type { Preview } from "@storybook/react-vite";
import { SpireAssets } from "../../../registry/spire/lib/assets-provider";
import "../src/storybook.css";

// Relative URLs resolve against iframe.html, so this works in `storybook dev` and under /spire-ui/storybook/.
const EXAMPLES = "./game-examples";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: { disabled: true },
    controls: { expanded: true },
  },
  globalTypes: {
    gameArt: {
      description: "Show the curated example game art instead of the original fallback icons",
      toolbar: { title: "Game art", icon: "photo", items: [{ value: "off", title: "Game art: off" }, { value: "examples", title: "Game art: examples" }], dynamicTitle: true },
    },
  },
  initialGlobals: { gameArt: "off" },
  decorators: [
    (Story, context) =>
      context.globals.gameArt === "examples" ? (
        <SpireAssets base={EXAMPLES} manifestUrl={`${EXAMPLES}/manifest.json`}><Story /></SpireAssets>
      ) : (
        <Story />
      ),
  ],
};
export default preview;
