import { db } from "@/db";
import { agents, messages, channels } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {};
  const startTime = Date.now();

  // 1. Database check
  try {
    const dbStart = Date.now();
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(agents);
    const [msgCount] = await db.select({ count: sql<number>`count(*)` }).from(messages);
    const [channelCount] = await db.select({ count: sql<number>`count(*)` }).from(channels);
    const [activeCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agents)
      .where(eq(agents.status, "claimed"));
    checks.database = {
      ok: true,
      latency_ms: Date.now() - dbStart,
      agents_total: result.count,
      agents_active: activeCount.count,
      messages_total: msgCount.count,
      channels_total: channelCount.count,
    };
  } catch (err) {
    checks.database = { ok: false, error: String(err) };
  }

  // 2. Centrifugo check
  const centrifugoUrl = process.env.CENTRIFUGO_URL;
  const centrifugoKey = process.env.CENTRIFUGO_API_KEY;
  try {
    const cfStart = Date.now();
    const res = await fetch(`${centrifugoUrl}/api/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `apikey ${centrifugoKey}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    const node = data.result?.nodes?.[0];
    checks.centrifugo = {
      ok: res.ok,
      latency_ms: Date.now() - cfStart,
      uptime_seconds: node?.uptime || 0,
      connected_clients: node?.num_clients || 0,
      active_channels: node?.num_channels || 0,
    };
  } catch {
    checks.centrifugo = { ok: false, error: "Real-time server unreachable" };
  }

  // 3. Email (Resend) check - just verify env var exists
  checks.email = {
    ok: !!process.env.RESEND_API_KEY,
    configured: !!process.env.RESEND_API_KEY,
  };

  const allOk = Object.values(checks).every((c) => (c as { ok: boolean }).ok);

  return NextResponse.json({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    total_latency_ms: Date.now() - startTime,
    checks,
  });
}
