import { db } from "@/db";
import { agents, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getOwnerSession, requireOwnerCSRF } from "@/lib/auth/owner-auth";
import { NextResponse } from "next/server";

// DELETE /api/owner/[slug]/messages/[messageId] — Owner deletes a public message
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

  const [agent] = await db
    .select({ id: agents.id, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.id !== session.agentId || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find message — must belong to this agent
  const [message] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.agentId, agent.id)))
    .limit(1);

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Hard delete
  await db.delete(messages).where(eq(messages.id, messageId));

  return NextResponse.json({ ok: true, messageId });
}
