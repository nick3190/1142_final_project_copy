import { NextResponse } from "next/server";
import { mergeSaveRecords, readPlayerSaves, writePlayerSaves } from "@/lib/server/playerSaveStore";
import { isRedisConfigured } from "@/lib/server/redis";
import {
  assertBodySize,
  normalizeNickname,
  parsePlayerSavePayload,
} from "@/lib/server/validatePlayerSave";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ configured: false, saves: [] });
  }

  const nickname = normalizeNickname(new URL(req.url).searchParams.get("nickname"));
  if (!nickname) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }

  const payload = await readPlayerSaves(nickname);
  return NextResponse.json({
    configured: true,
    nickname,
    saves: payload?.saves ?? [],
    syncedAt: payload?.syncedAt ?? null,
  });
}

export async function PUT(req: Request) {
  if (!isRedisConfigured()) {
    return NextResponse.json({ error: "redis_not_configured" }, { status: 503 });
  }

  try {
    assertBodySize(req);
  } catch {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const nickname =
    normalizeNickname(
      typeof body === "object" && body !== null && "nickname" in body
        ? (body as { nickname?: unknown }).nickname
        : null,
    ) ?? null;

  if (!nickname) {
    return NextResponse.json({ error: "invalid_nickname" }, { status: 400 });
  }

  const incoming = parsePlayerSavePayload(body, nickname);
  if (!incoming) {
    return NextResponse.json({ error: "invalid_saves" }, { status: 400 });
  }

  const existing = await readPlayerSaves(nickname);
  const merged = mergeSaveRecords(incoming, existing?.saves ?? []);
  const payload = await writePlayerSaves(nickname, merged);

  return NextResponse.json({
    ok: true,
    nickname,
    saves: payload.saves,
    syncedAt: payload.syncedAt,
  });
}
