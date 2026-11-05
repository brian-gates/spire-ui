import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { RunRow, type RunView } from "../lib/spire/game/run-row";

const run: RunView = {
  id: "r1", act: 2, floor: 21, ascension: 2, mode: "regular",
  players: [
    {
      id: "p1", name: "Ayla", character: "CHARACTER.IRONCLAD", hp: 40, maxHp: 80, gold: 123, isYou: true,
      relics: [{ id: "RELIC.BURNING_BLOOD" }], potions: [{ id: "POTION.FIRE", slot: 0 }], maxPotionSlots: 3,
    },
    { id: "p2", name: "Bo", character: "CHARACTER.SILENT" },
  ],
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="bg-spire-bg min-h-screen p-6">
      <RunRow run={run} />
    </main>
  </StrictMode>,
);
