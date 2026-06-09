import type { EndingId } from "@/lib/endings/types";
import type { SaveRecord } from "@/lib/player/saveTypes";
import type { StallId } from "@/lib/narrative/types";

const ENDING_IDS = new Set<EndingId>(["true", "basic", "stuck", "loop"]);
const STALL_IDS = new Set<StallId>(["pinball", "balloonshoot", "ringtoss", "catchfish"]);
const MAX_NICKNAME_LEN = 20;
const MAX_SAVES = 32;
const MAX_BODY_BYTES = 512_000;

export function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_NICKNAME_LEN) return null;
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGameScores(raw: unknown): SaveRecord["gameScores"] {
  if (!isRecord(raw)) return {};
  const scores: SaveRecord["gameScores"] = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!STALL_IDS.has(key as StallId)) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    scores[key as StallId] = value;
  }
  return scores;
}

function parseSnapshot(raw: unknown): SaveRecord["snapshot"] | undefined {
  if (!isRecord(raw)) return undefined;
  const acquired = Array.isArray(raw.acquired)
    ? raw.acquired.filter((id): id is string => typeof id === "string")
    : [];
  const visitedStalls = Array.isArray(raw.visitedStalls)
    ? raw.visitedStalls.filter((id): id is StallId => STALL_IDS.has(id as StallId))
    : [];
  const completedStalls = Array.isArray(raw.completedStalls)
    ? raw.completedStalls.filter((id): id is StallId => STALL_IDS.has(id as StallId))
    : [];
  const playedStalls = Array.isArray(raw.playedStalls)
    ? raw.playedStalls.filter((id): id is StallId => STALL_IDS.has(id as StallId))
    : [];

  return {
    visitedStalls,
    completedStalls,
    playedStalls,
    pointCardSpawnStall:
      typeof raw.pointCardSpawnStall === "string" && STALL_IDS.has(raw.pointCardSpawnStall as StallId)
        ? (raw.pointCardSpawnStall as StallId)
        : null,
    charmSpawns: [],
    marketOpeningDone: raw.marketOpeningDone === true,
    boundaryIndex: typeof raw.boundaryIndex === "number" ? raw.boundaryIndex : 0,
    seenEndingId: typeof raw.seenEndingId === "string" ? raw.seenEndingId : null,
    acquired,
    tokens: typeof raw.tokens === "number" ? raw.tokens : 0,
    ticket10: typeof raw.ticket10 === "number" ? raw.ticket10 : 0,
    ticket50: typeof raw.ticket50 === "number" ? raw.ticket50 : 0,
    roadSpawns: [],
    hubPosition: typeof raw.hubPosition === "string" ? raw.hubPosition : null,
  };
}

function parseSaveRecord(raw: unknown, nickname: string): SaveRecord | null {
  if (!isRecord(raw)) return null;
  const saveId = typeof raw.saveId === "string" ? raw.saveId.trim() : "";
  const saveNickname = typeof raw.nickname === "string" ? raw.nickname.trim() : nickname;
  if (!saveId || saveNickname !== nickname) return null;

  const endingId =
    typeof raw.endingId === "string" && ENDING_IDS.has(raw.endingId as EndingId)
      ? (raw.endingId as EndingId)
      : null;

  const updatedAt = typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now();
  const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : updatedAt;

  return {
    saveId,
    nickname: saveNickname,
    totalScore: typeof raw.totalScore === "number" ? raw.totalScore : 0,
    gameScores: parseGameScores(raw.gameScores),
    endingId,
    isActive: raw.isActive === true,
    updatedAt,
    createdAt,
    snapshot: parseSnapshot(raw.snapshot),
  };
}

export function parsePlayerSavePayload(body: unknown, nickname: string): SaveRecord[] | null {
  if (!isRecord(body)) return null;
  if (!Array.isArray(body.saves) || body.saves.length > MAX_SAVES) return null;

  const parsed = body.saves
    .map((item) => parseSaveRecord(item, nickname))
    .filter((item): item is SaveRecord => item !== null);

  if (parsed.length === 0) return null;
  return parsed;
}

export function assertBodySize(req: Request) {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new Error("payload_too_large");
  }
}

export function playerSavesKey(nickname: string) {
  return `nm:player:${encodeURIComponent(nickname)}`;
}

export function leaderboardKey(nickname: string) {
  return `nm:leaderboard:${encodeURIComponent(nickname)}`;
}

export const LEADERBOARD_INDEX_KEY = "nm:leaderboard:index";
