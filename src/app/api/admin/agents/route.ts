import { db } from "@/db";
import { agents, messages } from "@/db/schema";
import { getAdminSession, requireAdminCSRF } from "@/lib/admin-auth";
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
    const { agentId, action } = body;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!agentId || typeof agentId !== "string" || !uuidRegex.test(agentId)) {
      return NextResponse.json({ error: "Invalid agentId." }, { status: 400 });
    }
    if (!action || !["ban", "unban", "force_challenge"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use ban, unban, or force_challenge." }, { status: 400 });
    }

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

    const newStatus = action === "ban" ? "banned" : "claimed";

    const [updated] = await db
      .update(agents)
      .set({
        status: newStatus as "banned" | "claimed",
        ...(action === "unban" ? { failedChallenges: 0, suspendedUntil: null, forceChallenge: false } : {}),
      })
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
  } catch {
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}
