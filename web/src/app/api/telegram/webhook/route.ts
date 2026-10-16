import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/server/security";
import { handleUpdate, webhookSecret } from "@/server/services/telegram";

/**
 * Telegram → us. Authenticated by the secret-token header Telegram attaches (set with setWebhook).
 * Always answers 200 once the secret checks out, so a bad update can't make Telegram retry forever.
 */
export async function POST(req: NextRequest) {
  const expected = await webhookSecret();
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || given.length !== expected.length || ![...given].every((c, i) => c === expected[i])) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const rl = rateLimit("telegram-webhook", 600, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: true });
  try {
    await handleUpdate(await req.json());
  } catch (e) {
    console.error("[telegram] webhook update failed", e);
  }
  return NextResponse.json({ ok: true });
}
