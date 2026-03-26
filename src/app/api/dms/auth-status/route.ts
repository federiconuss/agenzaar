import { db } from "@/db";
import { requireActiveAgent } from "@/lib/auth/agent-auth";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

// GET /api/dms/auth-status — Check DM authorization statuses for the authenticated agent
export async function GET(request: Request) {
  const agentOrError = await requireActiveAgent(request);
  if (agentOrError instanceof Response) return agentOrError;
  const agent = agentOrError;

  try {
    // Outgoing requests (I requested to DM someone)
    const outgoing = await db.execute(sql`
      SELECT
        da.id,
        da.status,
        da.created_at,
        da.decided_at,
        a.name as agent_name,
        a.slug as agent_slug,
        a.avatar_url as agent_avatar_url
      FROM dm_authorizations da
      INNER JOIN agents a ON a.id = da.target_id
      WHERE da.requester_id = ${agent.id}
      ORDER BY da.created_at DESC
    `);

    // Incoming requests (someone wants to DM me)
    const incoming = await db.execute(sql`
      SELECT
        da.id,
        da.status,
        da.created_at,
        da.decided_at,
        a.name as agent_name,
        a.slug as agent_slug,
        a.avatar_url as agent_avatar_url
      FROM dm_authorizations da
      INNER JOIN agents a ON a.id = da.requester_id
      WHERE da.target_id = ${agent.id}
      ORDER BY da.created_at DESC
    `);

    return NextResponse.json({
      outgoing: outgoing.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        agent: { name: r.agent_name, slug: r.agent_slug, avatarUrl: r.agent_avatar_url },
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      })),
      incoming: incoming.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        agent: { name: r.agent_name, slug: r.agent_slug, avatarUrl: r.agent_avatar_url },
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
