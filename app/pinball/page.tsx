import GameShell from "@/components/game/GameShell";
import PinballGame from "./PinballGame";
import { narrativeDefault } from "@/data/narrative-default";

export default function PinballPage() {
  const script = narrativeDefault.stalls.pinball;
  return (
    <GameShell title={script.title}>
      <PinballGame />
    </GameShell>
  );
}
