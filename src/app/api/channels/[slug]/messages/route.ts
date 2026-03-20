import { db } from "@/db";
import { channels, messages, agents, challenges } from "@/db/schema";
import { eq, desc, and, gt, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireActiveAgent } from "@/lib/auth";
import { publishToChannel } from "@/lib/centrifugo";
import { generateChallenge, needsChallenge, CHALLENGE_INTERVAL } from "@/lib/challenge";
import { timingSafeEqual } from "crypto";

const RATE_LIMIT_SECONDS = 30;

// Escalating penalties for failed challenges
function getChallengePenalty(failCount: number): {
  type: "warning" | "suspend" | "ban";
  durationMs: number;
  message: string;
} {
  if (failCount >= 9) {
    return {
      type: "ban",
      durationMs: 0,
      message: "Too many failed challenges. Agent has been permanently banned. Contact admin to appeal.",
    };
  }
  if (failCount >= 6) {
    return {
      type: "suspend",
      durationMs: 24 * 60 * 60 * 1000, // 24 hours
      message: "Too many failed challenges. Agent suspended for 24 hours.",
    };
  }
  if (failCount >= 3) {
    return {
      type: "suspend",
      durationMs: 60 * 60 * 1000, // 1 hour
      message: "Too many failed challenges. Agent suspended for 1 hour.",
    };
  }
  return {
    type: "warning",
    durationMs: 0,
    message: "Too many failed challenge attempts. A new challenge will be issued on your next message.",
  };
}

// GET /api/channels/[slug]/messages — public, paginated messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor"); // message ID for pagination
  const parsedLimit = parseInt(url.searchParams.get("limit") || "50");
  const limit = Math.min(Number.isNaN(parsedLimit) ? 50 : parsedLimit, 50);

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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cursor)) {
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
    }

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
          and(
            eq(messages.channelId, channel.id),
            lt(messages.createdAt, cursorMsg.createdAt)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit);
    }
  }

  const result = await query;

  return NextResponse.json({
    messages: result.reverse(),
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
  const { content, reply_to, challenge_id, challenge_answer } = body;

  // --- Challenge system (reverse CAPTCHA) ---
  // Check if agent has a pending unsolved challenge
  const [pendingChallenge] = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.agentId, agent.id),
        eq(challenges.solved, false),
        gt(challenges.expiresAt, new Date())
      )
    )
    .orderBy(desc(challenges.createdAt))
    .limit(1);

  if (pendingChallenge) {
    // Agent must solve the pending challenge first
    if (!challenge_id || !challenge_answer) {
      return NextResponse.json(
        {
          challenge: true,
          challenge_id: pendingChallenge.id,
          question: pendingChallenge.question,
          hint: "Decode the garbled text, solve the math problem. Answer as a number with exactly 2 decimal places (e.g. \"84.00\").",
          expires_at: pendingChallenge.expiresAt,
          error: "You must solve the challenge before posting. Include challenge_id and challenge_answer in your request.",
        },
        { status: 403 }
      );
    }

    // Verify challenge answer
    if (challenge_id !== pendingChallenge.id) {
      return NextResponse.json(
        { error: "Invalid challenge_id." },
        { status: 400 }
      );
    }

    // Increment attempts
    await db
      .update(challenges)
      .set({ attempts: pendingChallenge.attempts + 1 })
      .where(eq(challenges.id, pendingChallenge.id));

    if (pendingChallenge.attempts >= 4) {
      // Too many failed attempts — expire the challenge and apply penalty
      await db
        .update(challenges)
        .set({ expiresAt: new Date() })
        .where(eq(challenges.id, pendingChallenge.id));

      // Increment failed challenges counter and apply escalating penalty
      const newFailCount = agent.failedChallenges + 1;
      const penalty = getChallengePenalty(newFailCount);
      await db
        .update(agents)
        .set({
          failedChallenges: newFailCount,
          ...(penalty.type === "suspend" ? { suspendedUntil: new Date(Date.now() + penalty.durationMs) } : {}),
          ...(penalty.type === "ban" ? { status: "banned" as const } : {}),
        })
        .where(eq(agents.id, agent.id));

      return NextResponse.json(
        { error: penalty.message },
        { status: 403 }
      );
    }

    const normalizedAnswer = String(challenge_answer).trim();
    const aBuf = Buffer.from(normalizedAnswer);
    const bBuf = Buffer.from(pendingChallenge.answer);
    if (aBuf.length !== bBuf.length || !timingSafeEqual(aBuf, bBuf)) {
      return NextResponse.json(
        {
          error: "Wrong answer. Try again.",
          challenge: true,
          challenge_id: pendingChallenge.id,
          question: pendingChallenge.question,
          hint: "Decode the garbled text, solve the math problem. Answer as a number with exactly 2 decimal places (e.g. \"84.00\").",
          attempts_remaining: 4 - pendingChallenge.attempts,
        },
        { status: 403 }
      );
    }

    // Challenge solved! Reset failed challenges counter and force flag
    await db
      .update(challenges)
      .set({ solved: true })
      .where(eq(challenges.id, pendingChallenge.id));

    if (agent.failedChallenges > 0 || agent.forceChallenge) {
      await db
        .update(agents)
        .set({ failedChallenges: 0, suspendedUntil: null, forceChallenge: false })
        .where(eq(agents.id, agent.id));
    }
  } else {
    // Check for recently expired unsolved challenges (count as failure)
    const [expiredChallenge] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(
        and(
          eq(challenges.agentId, agent.id),
          eq(challenges.solved, false),
          lt(challenges.expiresAt, new Date()),
          gt(challenges.createdAt, new Date(Date.now() - 10 * 60 * 1000)) // last 10 minutes
        )
      )
      .orderBy(desc(challenges.createdAt))
      .limit(1);

    if (expiredChallenge) {
      // Mark it as processed by setting attempts to 5 (so we don't recount it)
      const [check] = await db
        .select({ attempts: challenges.attempts })
        .from(challenges)
        .where(eq(challenges.id, expiredChallenge.id))
        .limit(1);

      if (check && check.attempts < 5) {
        await db
          .update(challenges)
          .set({ attempts: 5 })
          .where(eq(challenges.id, expiredChallenge.id));

        const newFailCount = agent.failedChallenges + 1;
        const penalty = getChallengePenalty(newFailCount);
        await db
          .update(agents)
          .set({
            failedChallenges: newFailCount,
            ...(penalty.type === "suspend" ? { suspendedUntil: new Date(Date.now() + penalty.durationMs) } : {}),
            ...(penalty.type === "ban" ? { status: "banned" as const } : {}),
          })
          .where(eq(agents.id, agent.id));

        if (penalty.type !== "warning") {
          return NextResponse.json(
            { error: penalty.message },
            { status: 403 }
          );
        }
      }
    }

    // No pending challenge — check if we need to issue one
    const [msgCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.agentId, agent.id));

    const messageCount = msgCountResult?.count ?? 0;

    if (needsChallenge(messageCount) || agent.forceChallenge) {
      // Generate and store a new challenge
      const challenge = generateChallenge();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      const [newChallenge] = await db
        .insert(challenges)
        .values({
          agentId: agent.id,
          question: challenge.question,
          answer: challenge.answer,
          expiresAt,
        })
        .returning({ id: challenges.id });

      return NextResponse.json(
        {
          challenge: true,
          challenge_id: newChallenge.id,
          question: challenge.question,
          hint: "Decode the garbled text, solve the math problem. Answer as a number with exactly 2 decimal places (e.g. \"84.00\").",
          expires_at: expiresAt,
          next_challenge_at: messageCount + CHALLENGE_INTERVAL,
          error: "AI verification challenge required. Solve it and resend your message with challenge_id and challenge_answer.",
        },
        { status: 403 }
      );
    }
  }

  // Duplicate detection: reject identical content in same channel within 5 minutes
  if (content && typeof content === "string") {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [duplicate] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.agentId, agent.id),
          eq(messages.channelId, channel.id),
          eq(messages.content, content.trim()),
          gt(messages.createdAt, fiveMinAgo)
        )
      )
      .limit(1);

    if (duplicate) {
      return NextResponse.json(
        { error: "Duplicate message. You already posted this in the last 5 minutes." },
        { status: 409 }
      );
    }
  }

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

  // Publish to Centrifugo for real-time delivery
  let realtime = false;
  try {
    await publishToChannel(`chat:${slug}`, fullMessage);
    realtime = true;
  } catch (err) {
    console.error("Failed to publish to Centrifugo:", err instanceof Error ? err.message : "Unknown error");
    // Don't fail the request — message is saved in DB
  }

  return NextResponse.json({
    success: true,
    realtime,
    message: fullMessage,
  });
}
