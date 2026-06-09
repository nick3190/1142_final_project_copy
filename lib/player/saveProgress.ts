import { INTERACTIVE_ORDER } from "@/lib/market/hubLayout";
import type { EndingId } from "@/lib/endings/types";
import type { StallId } from "@/lib/narrative/types";
import type { GameScores } from "@/store/playerStore";

const STALL_COUNT = INTERACTIVE_ORDER.length;

export function formatSaveProgress(
  gameScores: GameScores,
  endingId: EndingId | null,
  isActive: boolean,
): string {
  const played = INTERACTIVE_ORDER.filter((s) => gameScores[s.id] !== undefined);
  const stallNames = played.map((s) => s.label).join("、");
  const count = played.length;

  if (endingId) {
    return stallNames ? `已通關（${count}/${STALL_COUNT} 攤位：${stallNames}）` : `已通關（${count}/${STALL_COUNT} 攤位）`;
  }
  if (isActive) {
    return stallNames
      ? `進行中（${count}/${STALL_COUNT} 攤位：${stallNames}）`
      : `進行中（${count}/${STALL_COUNT} 攤位）`;
  }
  return stallNames
    ? `已中斷（${count}/${STALL_COUNT} 攤位：${stallNames}）`
    : `已中斷（${count}/${STALL_COUNT} 攤位）`;
}

export function formatEndingStatus(endingId: EndingId | null): string {
  return endingId ? "已達成" : "尚未達成";
}

export function canEnterSave(endingId: EndingId | null, isActive: boolean): boolean {
  return isActive && !endingId;
}
