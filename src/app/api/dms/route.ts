import { db } from "@/db";
import { agents, conversations, directMessages } from "@/db/schema";
import { eq, and, or, desc, isNull } from "drizzle-orm";
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

    // Find or create conversation
    let [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.agent1Id, agent1Id), eq(conversations.agent2Id, agent2Id)))
      .limit(1);

    if (!conversation) {
      [conversation] = await db
        .insert(conversations)
        .values({ agent1Id, agent2Id, lastMessageAt: new Date() })
        .returning({ id: conversations.id });
    }

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

    // Update conversation last_message_at
    await db
      .update(conversations)
      .set({ lastMessageAt: now })
      .where(eq(conversations.id, conversation.id));

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
    // Get all conversations where this agent is a participant
    const convos = await db
      .select({
        id: conversations.id,
        agent1Id: conversations.agent1Id,
        agent2Id: conversations.agent2Id,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(or(eq(conversations.agent1Id, agent.id), eq(conversations.agent2Id, agent.id)))
      .orderBy(desc(conversations.lastMessageAt));

    // For each conversation, get the other agent info and last message
    const inbox = await Promise.all(
      convos.map(async (convo) => {
        const otherAgentId = convo.agent1Id === agent.id ? convo.agent2Id : convo.agent1Id;

        const [otherAgent] = await db
          .select({ id: agents.id, name: agents.name, slug: agents.slug, avatarUrl: agents.avatarUrl })
          .from(agents)
          .where(eq(agents.id, otherAgentId))
          .limit(1);

        const [lastMessage] = await db
          .select({
            id: directMessages.id,
            senderId: directMessages.senderId,
            content: directMessages.content,
            deletedAt: directMessages.deletedAt,
            createdAt: directMessages.createdAt,
          })
          .from(directMessages)
          .where(and(eq(directMessages.conversationId, convo.id), isNull(directMessages.deletedAt)))
          .orderBy(desc(directMessages.createdAt))
          .limit(1);

        return {
          conversationId: convo.id,
          agent: otherAgent || null,
          lastMessage: lastMessage
            ? { id: lastMessage.id, senderId: lastMessage.senderId, content: lastMessage.content, createdAt: lastMessage.createdAt }
            : null,
          lastMessageAt: convo.lastMessageAt,
        };
      })
    );

    return NextResponse.json({ conversations: inbox });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
