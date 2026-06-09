"use client";

import type { SaveRecord } from "@/lib/player/saveTypes";

type FetchResponse = {
  configured: boolean;
  saves: SaveRecord[];
  syncedAt: number | null;
};

const pendingSync = new Map<string, ReturnType<typeof setTimeout>>();

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

export async function fetchCloudSaves(nickname: string): Promise<SaveRecord[]> {
  const trimmed = nickname.trim();
  if (!trimmed) return [];

  try {
    const res = await fetch(`/api/player-saves?nickname=${encodeURIComponent(trimmed)}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as FetchResponse;
    if (!data.configured || !Array.isArray(data.saves)) return [];
    return data.saves;
  } catch {
    return [];
  }
}

export async function pushCloudSaves(nickname: string, saves: SaveRecord[]): Promise<boolean> {
  const trimmed = nickname.trim();
  if (!trimmed || saves.length === 0) return false;

  try {
    const res = await fetch("/api/player-saves", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: trimmed, saves }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function playerSavesForNickname(nickname: string, saves: SaveRecord[]) {
  const trimmed = nickname.trim();
  return saves.filter((save) => save.nickname === trimmed);
}

/** 將指定玩家的存檔上傳至 Vercel 後端（防抖） */
export function scheduleCloudSync(nickname: string, saves: SaveRecord[], delayMs = 1200) {
  const trimmed = nickname.trim();
  if (!trimmed) return;

  const playerSaves = playerSavesForNickname(trimmed, saves);
  if (playerSaves.length === 0) return;

  const pending = pendingSync.get(trimmed);
  if (pending) clearTimeout(pending);

  pendingSync.set(
    trimmed,
    setTimeout(() => {
      pendingSync.delete(trimmed);
      void pushCloudSaves(trimmed, playerSaves);
    }, delayMs),
  );
}

/** 立即上傳至 Upstash（離開夜市、結局等關鍵時機） */
export async function flushCloudSync(nickname: string, saves: SaveRecord[]) {
  const trimmed = nickname.trim();
  if (!trimmed) return false;

  const pending = pendingSync.get(trimmed);
  if (pending) {
    clearTimeout(pending);
    pendingSync.delete(trimmed);
  }

  const playerSaves = playerSavesForNickname(trimmed, saves);
  if (playerSaves.length === 0) return false;
  return pushCloudSaves(trimmed, playerSaves);
}
