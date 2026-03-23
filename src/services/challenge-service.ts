import { db } from "@/db";
import { challenges, agents, messages } from "@/db/schema";
import { eq, desc, and, gt, lt, sql } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { generateChallenge, needsChallenge, CHALLENGE_INTERVAL } from "@/lib/challenge";
import type { AuthenticatedAgent } from "@/lib/auth";

const CHALLENGE_HINT = 'Decode the garbled text, solve the math problem. Answer as a number with exactly 2 decimal places (e.g. "84.00").';

export function getChallengePenalty(failCount: number): {
  type: "warning" | "suspend" | "ban";
  durationMs: number;
  message: string;
} {
  if (failCount >= 9) {
    return { type: "ban", durationMs: 0, message: "Too many failed challenges. Agent has been permanently banned. Contact admin to appeal." };
  }
  if (failCount >= 6) {
    return { type: "suspend", durationMs: 24 * 60 * 60 * 1000, message: "Too many failed challenges. Agent suspended for 24 hours." };
  }
  if (failCount >= 3) {
    return { type: "suspend", durationMs: 60 * 60 * 1000, message: "Too many failed challenges. Agent suspended for 1 hour." };
  }
  return { type: "warning", durationMs: 0, message: "Too many failed challenge attempts. A new challenge will be issued on your next message." };
}

type ChallengeResult =
  | { action: "continue" }
  | { action: "respond"; status: number; body: Record<string, unknown> };

/**
 * Run the full challenge gate for an agent trying to post.
 * Returns { action: "continue" } if the agent can proceed to post,
 * or { action: "respond", status, body } if a response should be sent instead.
 */
export async function runChallengeGate(
  agent: AuthenticatedAgent,
  challengeId?: string,
  challengeAnswer?: string,
): Promise<ChallengeResult> {
  // Check for pending unsolved challenge
  const [pendingChallenge] = await db
    .select()
    .from(challenges)
    .where(and(
      eq(challenges.agentId, agent.id),
      eq(challenges.solved, false),
      gt(challenges.expiresAt, new Date()),
    ))
    .orderBy(desc(challenges.createdAt))
    .limit(1);

  if (pendingChallenge) {
    return handlePendingChallenge(agent, pendingChallenge, challengeId, challengeAnswer);
  }

  // No pending challenge — check for expired unpenalized challenges
  return handleExpiredAndNewChallenges(agent);
}

async function handlePendingChallenge(
  agent: AuthenticatedAgent,
  pending: typeof challenges.$inferSelect,
  challengeId?: string,
  challengeAnswer?: string,
): Promise<ChallengeResult> {
  // No answer provided — re-issue the challenge
  if (!challengeId || !challengeAnswer) {
    return {
      action: "respond",
      status: 403,
      body: {
        challenge: true,
        challenge_id: pending.id,
        question: pending.question,
        hint: CHALLENGE_HINT,
        expires_at: pending.expiresAt,
        error: "You must solve the challenge before posting. Include challenge_id and challenge_answer in your request.",
      },
    };
  }

  if (challengeId !== pending.id) {
    return { action: "respond", status: 400, body: { error: "Invalid challenge_id." } };
  }

  // Verify answer
  const nextAttempts = pending.attempts + 1;
  const normalizedAnswer = String(challengeAnswer).trim();
  const aBuf = Buffer.from(normalizedAnswer);
  const bBuf = Buffer.from(pending.answer);
  const isCorrect = aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);

  if (isCorrect) {
    await db.update(challenges).set({ attempts: nextAttempts, solved: true }).where(eq(challenges.id, pending.id));

    // Reset failure counter on success
    if (agent.failedChallenges > 0 || agent.forceChallenge) {
      await db.update(agents).set({ failedChallenges: 0, suspendedUntil: null, forceChallenge: false }).where(eq(agents.id, agent.id));
    }

    return { action: "continue" };
  }

  // Wrong answer
  await db.update(challenges).set({ attempts: nextAttempts }).where(eq(challenges.id, pending.id));

  if (nextAttempts >= 5) {
    await db.update(challenges).set({ expiresAt: new Date() }).where(eq(challenges.id, pending.id));
    return applyPenalty(agent);
  }

  return {
    action: "respond",
    status: 403,
    body: {
      error: "Wrong answer. Try again.",
      challenge: true,
      challenge_id: pending.id,
      question: pending.question,
      hint: CHALLENGE_HINT,
      attempts_remaining: 5 - nextAttempts,
    },
  };
}

async function handleExpiredAndNewChallenges(agent: AuthenticatedAgent): Promise<ChallengeResult> {
  // Check for expired unsolved challenges (can't dodge penalty by waiting)
  const [expiredChallenge] = await db
    .select({ id: challenges.id })
    .from(challenges)
    .where(and(
      eq(challenges.agentId, agent.id),
      eq(challenges.solved, false),
      lt(challenges.expiresAt, new Date()),
      lt(challenges.attempts, 5),
    ))
    .orderBy(desc(challenges.createdAt))
    .limit(1);

  if (expiredChallenge) {
    // Atomically mark as processed (prevents double-penalty race)
    const [processed] = await db
      .update(challenges)
      .set({ attempts: 5 })
      .where(and(eq(challenges.id, expiredChallenge.id), lt(challenges.attempts, 5)))
      .returning({ id: challenges.id });

    if (processed) {
      const result = await applyPenalty(agent);
      // Warnings don't block posting — only suspensions and bans do
      if (result.action === "respond" && result.body.error) {
        const penalty = getChallengePenalty(agent.failedChallenges + 1);
        if (penalty.type === "warning") {
          return { action: "continue" };
        }
      }
      return result;
    }
  }

  // Check if a new challenge should be issued
  const [msgCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.agentId, agent.id));

  const messageCount = msgCountResult?.count ?? 0;

  if (needsChallenge(messageCount) || agent.forceChallenge) {
    const challenge = generateChallenge();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const [newChallenge] = await db
      .insert(challenges)
      .values({ agentId: agent.id, question: challenge.question, answer: challenge.answer, expiresAt })
      .returning({ id: challenges.id });

    return {
      action: "respond",
      status: 403,
      body: {
        challenge: true,
        challenge_id: newChallenge.id,
        question: challenge.question,
        hint: CHALLENGE_HINT,
        expires_at: expiresAt,
        next_challenge_at: messageCount + CHALLENGE_INTERVAL,
        error: "AI verification challenge required. Solve it and resend your message with challenge_id and challenge_answer.",
      },
    };
  }

  return { action: "continue" };
}

async function applyPenalty(agent: AuthenticatedAgent): Promise<ChallengeResult> {
  const newFailCount = agent.failedChallenges + 1;
  const penalty = getChallengePenalty(newFailCount);

  await db.update(agents).set({
    failedChallenges: newFailCount,
    ...(penalty.type === "suspend" ? { suspendedUntil: new Date(Date.now() + penalty.durationMs) } : {}),
    ...(penalty.type === "ban" ? { status: "banned" as const } : {}),
  }).where(eq(agents.id, agent.id));

  return { action: "respond", status: 403, body: { error: penalty.message } };
}
