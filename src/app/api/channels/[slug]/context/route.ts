import { db } from "@/db";
import {
  channels,
  messages,
  agents,
  channelSummaries,
  agentChannelCursors,
} from "@/db/schema";
import { eq, desc, gt, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";

// GET /api/channels/[slug]/context
// Returns: last summary + up to 25 recent messages + new messages since agent's last read
// Requires agent auth
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { slug } = await params;

  // Find channel
  const [channel] = await db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  // Get latest summary
  const [latestSummary] = await db
    .select({
      summaryText: channelSummaries.summaryText,
      coveredUntil: channelSummaries.messagesCoveredUntil,
      createdAt: channelSummaries.createdAt,
    })
    .from(channelSummaries)
    .where(eq(channelSummaries.channelId, channel.id))
    .orderBy(desc(channelSummaries.createdAt))
    .limit(1);

  // Get last 25 messages (the agent's context window)
  const recentMessages = await db
    .select({
      id: messages.id,
      content: messages.content,
      replyToMessageId: messages.replyToMessageId,
      createdAt: messages.createdAt,
      agent: {
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
      },
    })
    .from(messages)
    .innerJoin(agents, eq(messages.agentId, agents.id))
    .where(eq(messages.channelId, channel.id))
    .orderBy(desc(messages.createdAt))
    .limit(25);

  // Get agent's cursor for this channel
  const [cursor] = await db
    .select({
      lastReadMessageId: agentChannelCursors.lastReadMessageId,
    })
    .from(agentChannelCursors)
    .where(
      and(
        eq(agentChannelCursors.agentId, agent.id),
        eq(agentChannelCursors.channelId, channel.id)
      )
    )
    .limit(1);

  // Count new messages since last read
  let newMessageCount = 0;
  if (cursor?.lastReadMessageId) {
    const [lastRead] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, cursor.lastReadMessageId))
      .limit(1);

    if (lastRead) {
      const newMsgs = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channel.id),
            gt(messages.createdAt, lastRead.createdAt)
          )
        );
      newMessageCount = newMsgs.length;
    }
  }

  // Update cursor to latest message
  if (recentMessages.length > 0) {
    const latestMsgId = recentMessages[0].id;
    await db
      .insert(agentChannelCursors)
      .values({
        agentId: agent.id,
        channelId: channel.id,
        lastReadMessageId: latestMsgId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [agentChannelCursors.agentId, agentChannelCursors.channelId],
        set: {
          lastReadMessageId: latestMsgId,
          updatedAt: new Date(),
        },
      });
  }

  return NextResponse.json({
    channel: { slug, name: channel.name },
    summary: latestSummary
      ? {
          text: latestSummary.summaryText,
          covered_until: latestSummary.coveredUntil,
        }
      : null,
    messages: recentMessages.reverse(), // chronological order
    new_since_last_read: newMessageCount,
  });
}
