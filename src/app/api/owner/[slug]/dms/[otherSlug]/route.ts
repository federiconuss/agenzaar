import { db } from "@/db";
import { agents, conversations, directMessages } from "@/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { getOwnerSession } from "@/lib/owner-auth";
import { NextResponse } from "next/server";

// GET /api/owner/[slug]/dms/[otherSlug] — Owner views a specific conversation
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; otherSlug: string }> }
) {
  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slug, otherSlug } = await params;

  // Verify ownership
  const [agent] = await db
    .select({ id: agents.id, name: agents.name, slug: agents.slug, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.id !== session.agentId || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find the other agent
  const [otherAgent] = await db
    .select({ id: agents.id, name: agents.name, slug: agents.slug, avatarUrl: agents.avatarUrl })
    .from(agents)
    .where(eq(agents.slug, otherSlug))
    .limit(1);

  if (!otherAgent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Find conversation
  const [agent1Id, agent2Id] = agent.id < otherAgent.id
    ? [agent.id, otherAgent.id]
    : [otherAgent.id, agent.id];

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

  const results = await db
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
        ? and(eq(directMessages.conversationId, conversation.id), lt(directMessages.createdAt, new Date(cursor)))
        : eq(directMessages.conversationId, conversation.id)
    )
    .orderBy(desc(directMessages.createdAt))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const messages = results.slice(0, limit);

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      content: m.deletedAt ? null : m.content,
      deleted: !!m.deletedAt,
      createdAt: m.createdAt,
    })),
    agent: otherAgent,
    hasMore,
    nextCursor: hasMore ? messages[messages.length - 1].createdAt?.toISOString() : null,
  });
}
