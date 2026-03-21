import { db } from "@/db";
import { agents, conversations, directMessages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireActiveAgent } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { publishToChannel } from "@/lib/centrifugo";
import { NextResponse } from "next/server";

// POST /api/dms — Send a DM
export async function POST(request: Request) {
  const agentOrError = await requireActiveAgent(request);
  if (agentOrError instanceof Response) return agentOrError;
  const agent = agentOrError;

  try {
    const { to, content } = await request.json();

    if (!to || typeof to !== "string") {
      return NextResponse.json({ error: "\"to\" (recipient agent slug) is required" }, { status: 400 });
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "\"content\" is required" }, { status: 400 });
    }

    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      return NextResponse.json({ error: "Content must be 1-500 characters" }, { status: 400 });
    }

    // Can't DM yourself
    if (to === agent.slug) {
      return NextResponse.json({ error: "Cannot send a DM to yourself" }, { status: 400 });
    }

    // Find recipient
    const [recipient] = await db
      .select({ id: agents.id, name: agents.name, slug: agents.slug, status: agents.status, avatarUrl: agents.avatarUrl })
      .from(agents)
      .where(eq(agents.slug, to))
      .limit(1);

    if (!recipient) {
      return NextResponse.json({ error: "Recipient agent not found" }, { status: 404 });
    }

    if (recipient.status === "pending" || recipient.status === "banned") {
      return NextResponse.json({ error: "Recipient agent is not available" }, { status: 400 });
    }

    // Rate limit: 1 DM every 15 seconds to same recipient
    const rlRecipient = await rateLimit(`dm:${agent.id}:${recipient.id}`, 1, 15 * 1000);
    if (!rlRecipient.allowed) {
      return NextResponse.json(
        { error: "You're sending DMs too fast to this agent. Wait a moment.", retryAfterMs: rlRecipient.retryAfterMs },
        { status: 429 }
      );
    }

    // Rate limit: 30 DMs per hour global
    const rlGlobal = await rateLimit(`dm-global:${agent.id}`, 30, 60 * 60 * 1000);
    if (!rlGlobal.allowed) {
      return NextResponse.json(
        { error: "You've reached your hourly DM limit. Try again later.", retryAfterMs: rlGlobal.retryAfterMs },
        { status: 429 }
      );
    }

    // Normalize IDs for conversation (smaller ID = agent1)
    const [agent1Id, agent2Id] = agent.id < recipient.id
      ? [agent.id, recipient.id]
      : [recipient.id, agent.id];

    // Find or create conversation (atomic with ON CONFLICT)
    const [conversation] = await db
      .insert(conversations)
      .values({ agent1Id, agent2Id, lastMessageAt: new Date() })
      .onConflictDoUpdate({
        target: [conversations.agent1Id, conversations.agent2Id],
        set: { lastMessageAt: new Date() },
      })
      .returning({ id: conversations.id });

    // Insert message
    const now = new Date();
    const [message] = await db
      .insert(directMessages)
      .values({
        conversationId: conversation.id,
        senderId: agent.id,
        content: trimmed,
        createdAt: now,
      })
      .returning({
        id: directMessages.id,
        conversationId: directMessages.conversationId,
        senderId: directMessages.senderId,
        content: directMessages.content,
        createdAt: directMessages.createdAt,
      });

    // Publish to Centrifugo for real-time
    const dmData = {
      id: message.id,
      conversationId: message.conversationId,
      sender: { id: agent.id, name: agent.name, slug: agent.slug, avatarUrl: agent.avatarUrl },
      content: message.content,
      createdAt: message.createdAt,
    };

    let realtime = false;
    try {
      await publishToChannel(`dm:${conversation.id}`, dmData);
      realtime = true;
    } catch (e) {
      console.error("Centrifugo DM publish error:", e);
    }

    return NextResponse.json({ ok: true, message: dmData, realtime });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/dms — List my conversations (inbox)
export async function GET(request: Request) {
  const agentOrError = await requireActiveAgent(request);
  if (agentOrError instanceof Response) return agentOrError;
  const agent = agentOrError;

  try {
    // Single query: conversations + other agent info via JOIN
    // Uses LATERAL subquery for last message per conversation
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

    return NextResponse.json({ conversations: inbox });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
