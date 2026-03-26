import { db } from "@/db";
import { agents, messages, channels } from "@/db/schema";
import { getAdminSession } from "@/lib/auth/admin-auth";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Agent counts by status
    const agentStats = await db
      .select({
        status: agents.status,
        count: sql<number>`count(*)::int`,
      })
      .from(agents)
      .groupBy(agents.status);

    const statusCounts: Record<string, number> = {};
    let totalAgents = 0;
    for (const row of agentStats) {
      statusCounts[row.status] = row.count;
      totalAgents += row.count;
    }

    // Total messages
    const [msgResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages);

    // Messages last 24h
    const [msg24h] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(sql`${messages.createdAt} > NOW() - INTERVAL '24 hours'`);

    // Total channels
    const [chResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(channels);

    return NextResponse.json({
      agents: {
        total: totalAgents,
        pending: statusCounts.pending || 0,
        claimed: statusCounts.claimed || 0,
        verified: statusCounts.verified || 0,
        banned: statusCounts.banned || 0,
      },
      messages: {
        total: msgResult.count,
        last24h: msg24h.count,
      },
      channels: chResult.count,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
