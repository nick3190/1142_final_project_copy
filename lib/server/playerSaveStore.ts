import type { LeaderboardCloudEntry, PlayerCloudPayload, SaveRecord } from "@/lib/player/saveTypes";
import { isRedisConfigured, redis } from "@/lib/server/redis";
import {
  LEADERBOARD_INDEX_KEY,
  leaderboardKey,
  playerSavesKey,
} from "@/lib/server/validatePlayerSave";

function pickLeaderboardEntry(saves: SaveRecord[]): LeaderboardCloudEntry | null {
  if (saves.length === 0) return null;
  const best = [...saves].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return b.updatedAt - a.updatedAt;
  })[0];

  return {
    nickname: best.nickname,
    totalScore: best.totalScore,
    endingId: best.endingId,
    updatedAt: best.updatedAt,
    saveId: best.saveId,
  };
}

export async function readPlayerSaves(nickname: string): Promise<PlayerCloudPayload | null> {
  if (!isRedisConfigured()) return null;

  const data = await redis.get<PlayerCloudPayload>(playerSavesKey(nickname));
  if (!data || !Array.isArray(data.saves)) return null;
  return data;
}

export async function writePlayerSaves(nickname: string, saves: SaveRecord[]): Promise<PlayerCloudPayload> {
  if (!isRedisConfigured()) {
    throw new Error("redis_not_configured");
  }

  const payload: PlayerCloudPayload = {
    nickname,
    saves,
    syncedAt: Date.now(),
  };

  await redis.set(playerSavesKey(nickname), payload);

  const leaderboardEntry = pickLeaderboardEntry(saves);
  if (leaderboardEntry) {
    await redis.set(leaderboardKey(nickname), leaderboardEntry);
    await redis.sadd(LEADERBOARD_INDEX_KEY, nickname);
  }

  return payload;
}

export async function listLeaderboardEntries(): Promise<LeaderboardCloudEntry[]> {
  if (!isRedisConfigured()) return [];

  const nicknames = await redis.smembers<string>(LEADERBOARD_INDEX_KEY);
  if (!nicknames.length) return [];

  const rows = await Promise.all(
    nicknames.map(async (nickname) => redis.get<LeaderboardCloudEntry>(leaderboardKey(nickname))),
  );

  return rows
    .filter((row): row is LeaderboardCloudEntry => row !== null)
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.updatedAt - a.updatedAt;
    });
}

export function mergeSaveRecords(local: SaveRecord[], remote: SaveRecord[]): SaveRecord[] {
  const map = new Map<string, SaveRecord>();
  for (const save of remote) map.set(save.saveId, save);
  for (const save of local) {
    const existing = map.get(save.saveId);
    if (!existing || save.updatedAt >= existing.updatedAt) {
      map.set(save.saveId, save);
    }
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
