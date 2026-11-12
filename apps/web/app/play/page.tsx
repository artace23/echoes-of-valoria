import type { Metadata } from "next";
import { GameView } from "@/components/game/GameView";

export const metadata: Metadata = {
  title: "Play — Echoes of Valoria",
};

export default function PlayPage() {
  return (
    <main className="h-dvh w-full overflow-hidden bg-void">
      <GameView />
    </main>
  );
}
