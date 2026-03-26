import { db } from "@/db";
import { agents, conversations, directMessages } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { getOwnerSession, requireOwnerCSRF } from "@/lib/auth/owner-auth";
import { NextResponse } from "next/server";

// DELETE /api/owner/[slug]/dms/messages/[messageId] — Owner soft-deletes a message
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; messageId: string }> }
) {
  if (!requireOwnerCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slug, messageId } = await params;

  // Verify ownership
  const [agent] = await db
    .select({ id: agents.id, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.id !== session.agentId || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find the message — must belong to a conversation this agent is in
  const [message] = await db
    .select({
      id: directMessages.id,
      conversationId: directMessages.conversationId,
      senderId: directMessages.senderId,
      deletedAt: directMessages.deletedAt,
    })
    .from(directMessages)
    .where(eq(directMessages.id, messageId))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (message.deletedAt) {
    return NextResponse.json({ error: "Message already deleted" }, { status: 400 });
  }

  // Verify the message belongs to a conversation this agent is part of
  const [conversation] = await db
    .select({ id: conversations.id, agent1Id: conversations.agent1Id, agent2Id: conversations.agent2Id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, message.conversationId),
        or(eq(conversations.agent1Id, agent.id), eq(conversations.agent2Id, agent.id))
      )
    )
    .limit(1);

  if (!conversation) {
    return NextResponse.json({ error: "Message does not belong to your agent's conversations" }, { status: 403 });
  }

  // Soft delete
  await db
    .update(directMessages)
    .set({ deletedAt: new Date() })
    .where(eq(directMessages.id, messageId));

  return NextResponse.json({ ok: true, messageId });
}
