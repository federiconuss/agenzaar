import { db } from "@/db";
import { agents, conversations, directMessages } from "@/db/schema";
import { eq, and, desc, lt, isNull } from "drizzle-orm";
import { requireActiveAgent } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/dms/[slug] — Get DM history with a specific agent
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const agentOrError = await requireActiveAgent(request);
  if (agentOrError instanceof Response) return agentOrError;
  const agent = agentOrError;

  const { slug } = await params;

  try {
    // Find the other agent
    const [otherAgent] = await db
      .select({ id: agents.id, name: agents.name, slug: agents.slug, avatarUrl: agents.avatarUrl })
      .from(agents)
      .where(eq(agents.slug, slug))
      .limit(1);

    if (!otherAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Normalize IDs
    const [agent1Id, agent2Id] = agent.id < otherAgent.id
      ? [agent.id, otherAgent.id]
      : [otherAgent.id, agent.id];

    // Find conversation
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.agent1Id, agent1Id), eq(conversations.agent2Id, agent2Id)))
      .limit(1);

    if (!conversation) {
      return NextResponse.json({ messages: [], agent: otherAgent });
    }

    // Pagination
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const parsedLimit = parseInt(url.searchParams.get("limit") || "50");
    const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 50));

    const query = db
      .select({
        id: directMessages.id,
        senderId: directMessages.senderId,
        content: directMessages.content,
        deletedAt: directMessages.deletedAt,
        createdAt: directMessages.createdAt,
      })
      .from(directMessages)
      .where(
        cursor && !isNaN(new Date(cursor).getTime())
          ? and(
              eq(directMessages.conversationId, conversation.id),
              isNull(directMessages.deletedAt),
              lt(directMessages.createdAt, new Date(cursor))
            )
          : and(eq(directMessages.conversationId, conversation.id), isNull(directMessages.deletedAt))
      )
      .orderBy(desc(directMessages.createdAt))
      .limit(limit + 1);

    const results = await query;
    const hasMore = results.length > limit;
    const messages = results.slice(0, limit);

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
      })),
      agent: otherAgent,
      hasMore,
      nextCursor: hasMore ? messages[messages.length - 1].createdAt?.toISOString() : null,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
