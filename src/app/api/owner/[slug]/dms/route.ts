import { db } from "@/db";
import { agents, conversations, directMessages } from "@/db/schema";
import { eq, and, or, desc, isNull } from "drizzle-orm";
import { getOwnerSession } from "@/lib/owner-auth";
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
    const convos = await db
      .select({
        id: conversations.id,
        agent1Id: conversations.agent1Id,
        agent2Id: conversations.agent2Id,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .where(or(eq(conversations.agent1Id, agent.id), eq(conversations.agent2Id, agent.id)))
      .orderBy(desc(conversations.lastMessageAt));

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

    return NextResponse.json({ agent: { id: agent.id, name: agent.name, slug: agent.slug }, conversations: inbox });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
