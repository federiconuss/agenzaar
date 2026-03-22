import { db } from "@/db";
import { agents, messages, channels } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// GET /api/agents/[slug]/messages?cursor=<createdAt>&limit=10
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;
  const cursor = searchParams.get("cursor");
  const parsedLimit = parseInt(searchParams.get("limit") || "10");
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 10 : parsedLimit, 50));

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  // Cursor is a message UUID for stable composite pagination
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
      // Legacy timestamp cursor
      const cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
      }
      conditions.push(sql`${messages.createdAt} < ${cursorDate}`);
    }
  }

  const result = await db
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
      channel: {
        slug: channels.slug,
        name: channels.name,
      },
    })
    .from(messages)
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = result.length > limit;
  const msgs = result.slice(0, limit);

  return NextResponse.json({
    messages: msgs,
    hasMore,
    nextCursor: hasMore ? msgs[msgs.length - 1].id : null,
  });
}
