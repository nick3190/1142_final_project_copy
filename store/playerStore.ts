"use client";

import { create } from "zustand";
import type { EndingId } from "@/lib/endings/types";
import type { StallId } from "@/lib/narrative/types";
import { getEndingScript } from "@/data/endings-default";
import { flushCloudSync, mergeSaveRecords, scheduleCloudSync } from "@/lib/api/playerCloudSync";
import { upsertLeaderboardEntry } from "@/lib/firebase/leaderboard";
import {
  captureGameSnapshot,
  isInitialGameSnapshot,
  restoreGameSnapshot,
} from "@/lib/player/saveSnapshot";
import type { GameScores, SaveRecord } from "@/lib/player/saveTypes";

export type { GameScores, SaveRecord } from "@/lib/player/saveTypes";

/** @deprecated 請改用 SaveRecord */
export type PlayerRecord = SaveRecord;

const STORAGE_KEY = "night-market-players-v1";

type PersistedV2 = {
  loggedInNickname: string | null;
  activeSaveId: string | null;
  saves: SaveRecord[];
};

type PersistedLegacy = {
  activeNickname?: string | null;
  records?: {
    nickname: string;
    totalScore: number;
    gameScores: GameScores;
    endingId: EndingId | null;
    isActive: boolean;
    updatedAt: number;
  }[];
};

function createSaveId() {
  return `save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function migratePersisted(raw: PersistedLegacy & Partial<PersistedV2>): PersistedV2 {
  if (Array.isArray(raw.saves)) {
    return {
      loggedInNickname: raw.loggedInNickname ?? null,
      activeSaveId: raw.activeSaveId ?? null,
      saves: raw.saves,
    };
  }

  const legacyRecords = raw.records ?? [];
  const saves: SaveRecord[] = legacyRecords.map((r) => ({
    saveId: `legacy-${r.nickname}`,
    nickname: r.nickname,
    totalScore: r.totalScore,
    gameScores: r.gameScores,
    endingId: r.endingId,
    isActive: r.isActive,
    updatedAt: r.updatedAt,
    createdAt: r.updatedAt,
  }));

  const activeNickname = raw.activeNickname ?? null;
  const activeSaveId =
    activeNickname != null
      ? saves.find((s) => s.nickname === activeNickname && s.isActive && !s.endingId)?.saveId ?? null
      : null;

  return {
    loggedInNickname: activeNickname,
    activeSaveId,
    saves,
  };
}

function loadPersisted(): PersistedV2 {
  if (typeof window === "undefined") {
    return { loggedInNickname: null, activeSaveId: null, saves: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { loggedInNickname: null, activeSaveId: null, saves: [] };
    return migratePersisted(JSON.parse(raw) as PersistedLegacy & Partial<PersistedV2>);
  } catch {
    return { loggedInNickname: null, activeSaveId: null, saves: [] };
  }
}

function savePersisted(data: PersistedV2) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function syncToFirebase(record: SaveRecord) {
  void upsertLeaderboardEntry({
    nickname: record.nickname,
    totalScore: record.totalScore,
    endingId: record.endingId,
    updatedAt: record.updatedAt,
  }).catch(() => {});
}

function upsertSave(saves: SaveRecord[], next: SaveRecord): SaveRecord[] {
  const idx = saves.findIndex((s) => s.saveId === next.saveId);
  if (idx < 0) return [...saves, next];
  const copy = [...saves];
  copy[idx] = next;
  return copy;
}

function saveHasGameplayProgress(record: SaveRecord): boolean {
  return Object.keys(record.gameScores).length > 0 || record.totalScore > 0;
}

function shouldBackfillSnapshot(record: SaveRecord): boolean {
  if (!record.snapshot) return true;
  if (!saveHasGameplayProgress(record)) return false;
  return isInitialGameSnapshot(record.snapshot);
}

function nicknamesToSync(state: {
  loggedInNickname: string | null;
  activeSaveId: string | null;
  saves: SaveRecord[];
}) {
  const names = new Set<string>();
  if (state.loggedInNickname) names.add(state.loggedInNickname.trim());
  if (state.activeSaveId) {
    const active = state.saves.find((s) => s.saveId === state.activeSaveId);
    if (active?.nickname) names.add(active.nickname.trim());
  }
  return [...names].filter(Boolean);
}

function persistSaves(state: { loggedInNickname: string | null; activeSaveId: string | null; saves: SaveRecord[] }) {
  savePersisted(state);
  for (const nickname of nicknamesToSync(state)) {
    scheduleCloudSync(nickname, state.saves);
  }
}

async function persistSavesImmediate(state: {
  loggedInNickname: string | null;
  activeSaveId: string | null;
  saves: SaveRecord[];
}) {
  savePersisted(state);
  await Promise.all(nicknamesToSync(state).map((nickname) => flushCloudSync(nickname, state.saves)));
}

export function endingLabel(id: EndingId | null): string {
  if (!id) return "—";
  return getEndingScript(id)?.title ?? id;
}

type PlayerStore = {
  hydrated: boolean;
  loggedInNickname: string | null;
  activeSaveId: string | null;
  saves: SaveRecord[];
  hydrate: () => void;
  login: (nickname: string) => void;
  logout: () => void;
  mergeCloudSaves: (nickname: string, cloudSaves: SaveRecord[]) => void;
  getPlayerSaves: (nickname: string) => SaveRecord[];
  getActiveSave: () => SaveRecord | undefined;
  findRecord: (nickname: string) => SaveRecord | undefined;
  getLeaderboard: () => SaveRecord[];
  snapshotActiveSave: () => void;
  flushActiveSaveToCloud: () => Promise<void>;
  createNewSave: (nickname: string) => string;
  loadSave: (saveId: string) => void;
  beginNewRun: (nickname: string) => void;
  resumeRun: (nickname: string) => void;
  recordStallScore: (stallId: StallId, score: number) => void;
  finishRun: (endingId: EndingId) => void;
};

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  hydrated: false,
  loggedInNickname: null,
  activeSaveId: null,
  saves: [],

  hydrate: () => {
    const p = loadPersisted();
    set({
      hydrated: true,
      loggedInNickname: p.loggedInNickname,
      activeSaveId: p.activeSaveId,
      saves: p.saves,
    });
  },

  login: (nickname) => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    set({ loggedInNickname: trimmed });
    const p = loadPersisted();
    savePersisted({ ...p, loggedInNickname: trimmed });
  },

  logout: () => {
    set({ loggedInNickname: null });
    const p = loadPersisted();
    savePersisted({ ...p, loggedInNickname: null });
  },

  mergeCloudSaves: (nickname, cloudSaves) => {
    const trimmed = nickname.trim();
    if (!trimmed || cloudSaves.length === 0) return;

    const local = get().saves.filter((save) => save.nickname === trimmed);
    const mergedForPlayer = mergeSaveRecords(local, cloudSaves);
    const otherSaves = get().saves.filter((save) => save.nickname !== trimmed);
    const saves = [...otherSaves, ...mergedForPlayer];

    const state = {
      loggedInNickname: get().loggedInNickname,
      activeSaveId: get().activeSaveId,
      saves,
    };
    set({ saves });
    persistSaves(state);
  },

  flushActiveSaveToCloud: async () => {
    get().snapshotActiveSave();
    const state = {
      loggedInNickname: get().loggedInNickname,
      activeSaveId: get().activeSaveId,
      saves: get().saves,
    };
    await persistSavesImmediate(state);
  },

  getPlayerSaves: (nickname) => {
    const trimmed = nickname.trim();
    return [...get().saves]
      .filter((s) => s.nickname === trimmed)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },

  getActiveSave: () => {
    const id = get().activeSaveId;
    if (!id) return undefined;
    return get().saves.find((s) => s.saveId === id);
  },

  findRecord: (nickname) => {
    const trimmed = nickname.trim();
    const playerSaves = get().getPlayerSaves(trimmed);
    return playerSaves.find((s) => s.isActive && !s.endingId) ?? playerSaves[0];
  },

  getLeaderboard: () =>
    [...get().saves].sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.updatedAt - a.updatedAt;
    }),

  snapshotActiveSave: () => {
    const saveId = get().activeSaveId;
    if (!saveId) return;
    const existing = get().saves.find((s) => s.saveId === saveId);
    if (!existing) return;

    const snapshot = captureGameSnapshot();
    const record: SaveRecord = {
      ...existing,
      snapshot,
      updatedAt: Date.now(),
    };
    const saves = upsertSave(get().saves, record);
    const state = {
      loggedInNickname: get().loggedInNickname,
      activeSaveId: get().activeSaveId,
      saves,
    };
    set({ saves });
    persistSaves(state);
  },

  createNewSave: (nickname) => {
    get().snapshotActiveSave();

    const trimmed = nickname.trim();
    const now = Date.now();
    const saveId = createSaveId();
    const record: SaveRecord = {
      saveId,
      nickname: trimmed,
      totalScore: 0,
      gameScores: {},
      endingId: null,
      isActive: true,
      updatedAt: now,
      createdAt: now,
      snapshot: captureGameSnapshot(),
    };
    const saves = upsertSave(get().saves, record);
    const state = {
      loggedInNickname: trimmed,
      activeSaveId: saveId,
      saves,
    };
    set({
      loggedInNickname: trimmed,
      activeSaveId: saveId,
      saves,
    });
    persistSaves(state);
    syncToFirebase(record);
    return saveId;
  },

  loadSave: (saveId) => {
    get().snapshotActiveSave();

    const target = get().saves.find((s) => s.saveId === saveId);
    if (!target) return;

    const now = Date.now();
    let record: SaveRecord = { ...target, isActive: true, updatedAt: now };

    if (shouldBackfillSnapshot(record)) {
      record = { ...record, snapshot: captureGameSnapshot() };
    } else if (record.snapshot) {
      restoreGameSnapshot(record.snapshot);
    }

    const saves = upsertSave(get().saves, record);
    const nextState = {
      loggedInNickname: target.nickname,
      activeSaveId: saveId,
      saves,
    };
    set(nextState);
    persistSaves(nextState);
  },

  beginNewRun: (nickname) => {
    get().createNewSave(nickname);
  },

  resumeRun: (nickname) => {
    const trimmed = nickname.trim();
    const active = get()
      .getPlayerSaves(trimmed)
      .find((s) => s.isActive && !s.endingId);
    if (active) {
      get().loadSave(active.saveId);
      return;
    }
    get().createNewSave(trimmed);
  },

  recordStallScore: (stallId, score) => {
    const saveId = get().activeSaveId;
    if (!saveId) return;
    const existing = get().saves.find((s) => s.saveId === saveId);
    if (!existing) return;

    const gameScores = { ...existing.gameScores, [stallId]: score };
    const totalScore = Object.values(gameScores).reduce((sum, v) => sum + (v ?? 0), 0);
    const record: SaveRecord = {
      ...existing,
      gameScores,
      totalScore,
      isActive: true,
      updatedAt: Date.now(),
      snapshot: captureGameSnapshot(),
    };
    const saves = upsertSave(get().saves, record);
    const state = {
      loggedInNickname: get().loggedInNickname,
      activeSaveId: get().activeSaveId,
      saves,
    };
    set({ saves });
    persistSaves(state);
    syncToFirebase(record);
  },

  finishRun: (endingId) => {
    const saveId = get().activeSaveId;
    if (!saveId) return;
    const existing = get().saves.find((s) => s.saveId === saveId);
    if (!existing) return;

    const snapshot = captureGameSnapshot();
    const record: SaveRecord = {
      ...existing,
      endingId,
      isActive: false,
      updatedAt: Date.now(),
      snapshot,
    };
    const saves = upsertSave(get().saves, record);
    const state = {
      loggedInNickname: get().loggedInNickname,
      activeSaveId: null as string | null,
      saves,
    };
    set({ saves, activeSaveId: null });
    void persistSavesImmediate(state);
    syncToFirebase(record);
  },
}));
