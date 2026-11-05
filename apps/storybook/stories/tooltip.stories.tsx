import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../../../registry/spire/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../registry/spire/ui/tooltip";

function Demo(props: { side: "top" | "right" | "bottom" | "left"; text: string }) {
  return (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="secondary">Focus or hover me</Button>
      </TooltipTrigger>
      <TooltipContent side={props.side}>{props.text}</TooltipContent>
    </Tooltip>
  );
}

const meta = {
  title: "Primitives/Tooltip",
  component: Demo,
  args: { side: "top", text: "Gain 1 Energy at the start of each turn." },
  argTypes: { side: { control: "inline-radio", options: ["top", "right", "bottom", "left"] } },
  decorators: [(Story) => <div className="px-24 py-20"><Story /></div>],
} satisfies Meta<typeof Demo>;
export default meta;
export const OpenOnFocus: StoryObj<typeof meta> = {};
