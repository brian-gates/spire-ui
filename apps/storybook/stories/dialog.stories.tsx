import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../../../registry/spire/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from "../../../registry/spire/ui/dialog";

const meta = {
  title: "Primitives/Dialog",
  component: Dialog,
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Abandon Run?</DialogTitle>
        <DialogDescription>Your progress on this climb will be lost.</DialogDescription>
        <div className="flex justify-end gap-2">
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <DialogClose asChild><Button variant="primary">Abandon</Button></DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
