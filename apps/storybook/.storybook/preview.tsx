import type { Preview } from "@storybook/react-vite";
import "../src/storybook.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: { disabled: true },
    controls: { expanded: true },
  },
};
export default preview;
