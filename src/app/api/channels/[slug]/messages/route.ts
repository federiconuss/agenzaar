import { db } from "@/db";
import { channels, messages, agents } from "@/db/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireActiveAgent } from "@/lib/auth";
import { publishToChannel } from "@/lib/centrifugo";

const RATE_LIMIT_SECONDS = 30;

// GET /api/channels/[slug]/messages — public, paginated messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor"); // message ID for pagination
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 50);

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
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  if (cursor) {
    // Get the cursor message's createdAt for keyset pagination
    const [cursorMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, cursor))
      .limit(1);

    if (cursorMsg) {
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
          eq(messages.channelId, channel.id),
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit);
    }
  }

  const result = await query;

  return NextResponse.json({
    messages: result,
    next_cursor: result.length === limit ? result[result.length - 1]?.id : null,
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

  // Rate limit: 1 message per 30 seconds per agent per channel
  const cooldownTime = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000);
  const [recentMsg] = await db
    .select({ id: messages.id, createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.agentId, agent.id),
        eq(messages.channelId, channel.id),
        gt(messages.createdAt, cooldownTime)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (recentMsg) {
    const waitSeconds = Math.ceil(
      (recentMsg.createdAt.getTime() + RATE_LIMIT_SECONDS * 1000 - Date.now()) / 1000
    );
    return NextResponse.json(
      { error: `Rate limited. Wait ${waitSeconds}s before posting again in this channel.` },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { content, reply_to } = body;

  // Validate content
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: "Message content is required." },
      { status: 400 }
    );
  }

  if (content.length > 500) {
    return NextResponse.json(
      { error: "Message must be 500 characters or less." },
      { status: 400 }
    );
  }

  // Validate reply_to if provided
  if (reply_to) {
    const [replyMsg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.id, reply_to))
      .limit(1);

    if (!replyMsg) {
      return NextResponse.json(
        { error: "Reply target message not found." },
        { status: 400 }
      );
    }
  }

  // Insert message
  const [message] = await db
    .insert(messages)
    .values({
      channelId: channel.id,
      agentId: agent.id,
      content: content.trim(),
      replyToMessageId: reply_to || null,
    })
    .returning({
      id: messages.id,
      content: messages.content,
      replyToMessageId: messages.replyToMessageId,
      createdAt: messages.createdAt,
    });

  const fullMessage = {
    ...message,
    agent: {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      avatarUrl: agent.avatarUrl ?? null,
    },
  };

  // Publish to Centrifugo for real-time delivery (fire and forget)
  try {
    await publishToChannel(`chat:${slug}`, fullMessage);
  } catch (err) {
    console.error("Failed to publish to Centrifugo:", err);
    // Don't fail the request — message is saved in DB
  }

  return NextResponse.json({
    success: true,
    message: fullMessage,
  });
}
