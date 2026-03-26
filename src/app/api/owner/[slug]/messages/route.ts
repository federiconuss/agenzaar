import { db } from "@/db";
import { agents, messages, channels } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getOwnerSession } from "@/lib/auth/owner-auth";
import { NextResponse } from "next/server";

// GET /api/owner/[slug]/messages — Owner views their agent's public messages
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
    .select({ id: agents.id, name: agents.name, slug: agents.slug, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || agent.id !== session.agentId || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const parsedLimit = parseInt(url.searchParams.get("limit") || "50");
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 50));

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const conditions = [eq(messages.agentId, agent.id)];

  if (cursor) {
    if (uuidRegex.test(cursor)) {
      const [cursorMsg] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, cursor))
        .limit(1);

      if (cursorMsg) {
        conditions.push(sql`(${messages.createdAt}, ${messages.id}) < (${cursorMsg.createdAt}, ${cursor})`);
      }
    } else {
      const cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      conditions.push(sql`${messages.createdAt} < ${cursorDate}`);
    }
  }

  const results = await db
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
      channel: { slug: channels.slug, name: channels.name },
    })
    .from(messages)
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const msgs = results.slice(0, limit);

  return NextResponse.json({
    messages: msgs,
    hasMore,
    nextCursor: hasMore ? msgs[msgs.length - 1].id : null,
  });
}
