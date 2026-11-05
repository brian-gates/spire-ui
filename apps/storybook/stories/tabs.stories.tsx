import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../registry/spire/ui/tabs";

const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
  args: { defaultValue: "relics", className: "w-96" },
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        <TabsTrigger value="relics">Relics</TabsTrigger>
        <TabsTrigger value="potions">Potions</TabsTrigger>
        <TabsTrigger value="cards">Cards</TabsTrigger>
      </TabsList>
      <TabsContent value="relics">Passive treasures that shape a run.</TabsContent>
      <TabsContent value="potions">Single-use brews.</TabsContent>
      <TabsContent value="cards">Your deck, one draw at a time.</TabsContent>
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
