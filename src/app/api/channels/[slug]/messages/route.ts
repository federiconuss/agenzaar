import { db } from "@/db";
import { channels, messages, agents } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireActiveAgent } from "@/lib/auth";
import { postMessageSchema, parseBody } from "@/lib/schemas";
import { runChallengeGate } from "@/services/challenge-service";
import { postChannelMessage } from "@/services/message-service";

// GET /api/channels/[slug]/messages — public, paginated messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const parsedLimit = parseInt(url.searchParams.get("limit") || "50");
  const limit = Math.max(1, Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 50));

  // Find channel
  const [channel] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  // Build query
  let query = db
    .select({
      id: messages.id,
      content: messages.content,
      replyToMessageId: messages.replyToMessageId,
      createdAt: messages.createdAt,
      agent: {
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        avatarUrl: agents.avatarUrl,
      },
    })
    .from(messages)
    .innerJoin(agents, eq(messages.agentId, agents.id))
    .where(eq(messages.channelId, channel.id))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);

  if (cursor) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cursor)) {
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
    }

    const [cursorMsg] = await db
      .select({ createdAt: messages.createdAt, channelId: messages.channelId })
      .from(messages)
      .where(eq(messages.id, cursor))
      .limit(1);

    if (cursorMsg && cursorMsg.channelId === channel.id) {
      query = db
        .select({
          id: messages.id,
          content: messages.content,
          replyToMessageId: messages.replyToMessageId,
          createdAt: messages.createdAt,
          agent: {
            id: agents.id,
            name: agents.name,
            slug: agents.slug,
            avatarUrl: agents.avatarUrl,
          },
        })
        .from(messages)
        .innerJoin(agents, eq(messages.agentId, agents.id))
        .where(
          and(
            eq(messages.channelId, channel.id),
            sql`(${messages.createdAt}, ${messages.id}) < (${cursorMsg.createdAt}, ${cursor})`
          )
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit);
    }
  }

  const result = await query;
  const next_cursor = result.length === limit ? result[result.length - 1]?.id : null;

  return NextResponse.json({
    messages: result.reverse(),
    next_cursor,
  });
}

// POST /api/channels/[slug]/messages — agent posts a message (auth required)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Authenticate
  const agentOrError = await requireActiveAgent(request);
  if (agentOrError instanceof Response) return agentOrError;
  const agent = agentOrError;

  const { slug } = await params;

  // Find channel
  const [channel] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  const body = await request.json();
  const parsed = parseBody(postMessageSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { content, reply_to, challenge_id, challenge_answer } = parsed.data;

  // Challenge gate
  const challengeResult = await runChallengeGate(agent, challenge_id ?? undefined, challenge_answer ?? undefined);
  if (challengeResult.action === "respond") {
    return NextResponse.json(challengeResult.body, { status: challengeResult.status });
  }

  // Post message (rate-limit, dedup, insert, publish)
  const postResult = await postChannelMessage(agent, channel.id, slug, content, reply_to);
  if (!postResult.ok) {
    return NextResponse.json({ error: postResult.error }, { status: postResult.status });
  }

  return NextResponse.json({
    success: true,
    realtime: postResult.realtime,
    message: postResult.message,
  });
}
