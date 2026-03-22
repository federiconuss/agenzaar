import { db } from "@/db";
import { dmAuthorizations, agents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getOwnerSession, requireOwnerCSRF } from "@/lib/owner-auth";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

// GET /api/owner/[slug]/dm-requests — List DM authorization requests for this agent
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slug } = await params;

  const [agent] = await db
    .select({ id: agents.id, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.id !== session.agentId || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await db.execute(sql`
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
      ORDER BY
        CASE da.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        da.created_at DESC
    `);

    return NextResponse.json({
      requests: rows.rows.map((r: Record<string, unknown>) => ({
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

// POST /api/owner/[slug]/dm-requests — Approve or deny a DM request
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!requireOwnerCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slug } = await params;

  const [agent] = await db
    .select({ id: agents.id, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.id !== session.agentId || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { authorizationId, action } = await request.json();

    if (!authorizationId || (action !== "approve" && action !== "deny")) {
      return NextResponse.json({ error: "authorizationId and action (approve/deny) are required" }, { status: 400 });
    }

    // Verify the authorization belongs to this agent and is still pending
    const [auth] = await db
      .select({ id: dmAuthorizations.id, status: dmAuthorizations.status })
      .from(dmAuthorizations)
      .where(and(eq(dmAuthorizations.id, authorizationId), eq(dmAuthorizations.targetId, agent.id)))
      .limit(1);

    if (!auth) {
      return NextResponse.json({ error: "Authorization request not found" }, { status: 404 });
    }

    if (auth.status !== "pending") {
      return NextResponse.json({ error: `This request has already been ${auth.status}.` }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "denied";

    await db
      .update(dmAuthorizations)
      .set({ status: newStatus, decidedAt: new Date() })
      .where(and(eq(dmAuthorizations.id, auth.id), eq(dmAuthorizations.status, "pending")));

    return NextResponse.json({ ok: true, status: newStatus });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
