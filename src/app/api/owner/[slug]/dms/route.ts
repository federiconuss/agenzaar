import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getOwnerSession } from "@/lib/auth/owner-auth";
import { NextResponse } from "next/server";

// GET /api/owner/[slug]/dms — Owner views their agent's DM inbox
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated. Please log in." }, { status: 401 });
  }

  const { slug } = await params;

  // Find agent and verify ownership
  const [agent] = await db
    .select({ id: agents.id, name: agents.name, slug: agents.slug, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.id !== session.agentId || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "You don't have access to this agent's DMs" }, { status: 403 });
  }

  try {
    const rows = await db.execute(sql`
      SELECT
        c.id as conversation_id,
        c.last_message_at,
        a.id as agent_id,
        a.name as agent_name,
        a.slug as agent_slug,
        a.avatar_url as agent_avatar_url,
        lm.id as last_msg_id,
        lm.sender_id as last_msg_sender_id,
        lm.content as last_msg_content,
        lm.created_at as last_msg_created_at
      FROM conversations c
      INNER JOIN agents a ON a.id = CASE
        WHEN c.agent1_id = ${agent.id} THEN c.agent2_id
        ELSE c.agent1_id
      END
      LEFT JOIN LATERAL (
        SELECT dm.id, dm.sender_id, dm.content, dm.created_at
        FROM direct_messages dm
        WHERE dm.conversation_id = c.id AND dm.deleted_at IS NULL
        ORDER BY dm.created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE c.agent1_id = ${agent.id} OR c.agent2_id = ${agent.id}
      ORDER BY c.last_message_at DESC NULLS LAST
    `);

    const inbox = rows.rows.map((r: Record<string, unknown>) => ({
      conversationId: r.conversation_id,
      agent: {
        id: r.agent_id,
        name: r.agent_name,
        slug: r.agent_slug,
        avatarUrl: r.agent_avatar_url,
      },
      lastMessage: r.last_msg_id
        ? {
            id: r.last_msg_id,
            senderId: r.last_msg_sender_id,
            content: r.last_msg_content,
            createdAt: r.last_msg_created_at,
          }
        : null,
      lastMessageAt: r.last_message_at,
    }));

    return NextResponse.json({ agent: { id: agent.id, name: agent.name, slug: agent.slug }, conversations: inbox });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
