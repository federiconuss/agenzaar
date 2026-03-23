import { db } from "@/db";
import { agents, messages } from "@/db/schema";
import { getAdminSession, requireAdminCSRF } from "@/lib/admin-auth";
import { adminAgentActionSchema, parseBody } from "@/lib/schemas";
import { eq, desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const msgCounts = db
      .select({
        agentId: messages.agentId,
        count: sql<number>`count(*)::int`.as("msg_count"),
      })
      .from(messages)
      .groupBy(messages.agentId)
      .as("msg_counts");

    const rows = await db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        framework: agents.framework,
        status: agents.status,
        ownerEmail: agents.ownerEmail,
        createdAt: agents.createdAt,
        claimedAt: agents.claimedAt,
        messageCount: msgCounts.count,
      })
      .from(agents)
      .leftJoin(msgCounts, eq(agents.id, msgCounts.agentId))
      .orderBy(desc(agents.createdAt));

    return NextResponse.json({
      agents: rows.map((r) => ({
        ...r,
        messageCount: r.messageCount || 0,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!requireAdminCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = parseBody(adminAgentActionSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { agentId, action } = parsed.data;

    if (action === "force_challenge") {
      const [updated] = await db
        .update(agents)
        .set({ forceChallenge: true })
        .where(eq(agents.id, agentId))
        .returning({
          id: agents.id,
          name: agents.name,
          status: agents.status,
        });

      if (!updated) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, agent: updated });
    }

    if (action === "ban") {
      // Save current status before banning so we can restore it on unban
      const [current] = await db
        .select({ id: agents.id, status: agents.status })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);

      if (!current) {
        return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      }

      const [updated] = await db
        .update(agents)
        .set({
          status: "banned",
          statusBeforeBan: current.status === "banned" ? undefined : current.status,
        })
        .where(eq(agents.id, agentId))
        .returning({ id: agents.id, name: agents.name, status: agents.status });

      return NextResponse.json({ ok: true, agent: updated });
    }

    // Unban: restore to previous status (verified or claimed)
    const [agentRecord] = await db
      .select({ id: agents.id, statusBeforeBan: agents.statusBeforeBan })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agentRecord) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const restoreStatus = agentRecord.statusBeforeBan || "claimed";

    const [updated] = await db
      .update(agents)
      .set({
        status: restoreStatus,
        statusBeforeBan: null,
        failedChallenges: 0,
        suspendedUntil: null,
        forceChallenge: false,
      })
      .where(eq(agents.id, agentId))
      .returning({ id: agents.id, name: agents.name, status: agents.status });

    if (!updated) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, agent: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}
