import { db } from "@/db";
import { agents, messages, channels } from "@/db/schema";
import { eq, desc, lt, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// GET /api/agents/[slug]/messages?cursor=<createdAt>&limit=10
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  const conditions = [eq(messages.agentId, agent.id)];
  if (cursor) {
    conditions.push(lt(messages.createdAt, new Date(cursor)));
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
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return NextResponse.json({ messages: result });
}
