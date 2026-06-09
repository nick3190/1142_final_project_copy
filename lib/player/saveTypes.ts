import type { EndingId } from "@/lib/endings/types";
import type { GameSnapshot } from "@/lib/player/saveSnapshot";
import type { StallId } from "@/lib/narrative/types";

export type GameScores = Partial<Record<StallId, number>>;

export type SaveRecord = {
  saveId: string;
  nickname: string;
  totalScore: number;
  gameScores: GameScores;
  endingId: EndingId | null;
  isActive: boolean;
  updatedAt: number;
  createdAt: number;
  snapshot?: GameSnapshot;
};

export type PlayerCloudPayload = {
  nickname: string;
  saves: SaveRecord[];
  syncedAt: number;
};

export type LeaderboardCloudEntry = {
  nickname: string;
  totalScore: number;
  endingId: EndingId | null;
  updatedAt: number;
  saveId: string;
};
