import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";
import { publishToChannel } from "@/lib/centrifugo";
import type { AuthenticatedAgent } from "@/lib/auth";

const RATE_LIMIT_SECONDS = 30;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

type PostResult =
  | { ok: true; message: Record<string, unknown>; realtime: boolean }
  | { ok: false; status: number; error: string };

/**
 * Validate, rate-limit, dedup, insert and publish a channel message.
 */
export async function postChannelMessage(
  agent: AuthenticatedAgent,
  channelId: string,
  channelSlug: string,
  content: string,
  replyTo?: string | null,
): Promise<PostResult> {
  // Validate content
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return { ok: false, status: 400, error: "Message content is required." };
  }
  if (content.length > 500) {
    return { ok: false, status: 400, error: "Message must be 500 characters or less." };
  }

  const trimmedContent = content.trim();

  // Validate reply_to
  if (replyTo) {
    const [replyMsg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, replyTo), eq(messages.channelId, channelId)))
      .limit(1);

    if (!replyMsg) {
      return { ok: false, status: 400, error: "Reply target message not found in this channel." };
    }
  }

  // Rate limit: 1 message per 30 seconds per agent per channel
  const rlResult = await rateLimit(`msg:${agent.id}:${channelId}`, 1, RATE_LIMIT_SECONDS * 1000);
  if (!rlResult.allowed) {
    const waitSeconds = Math.ceil(rlResult.retryAfterMs / 1000);
    return { ok: false, status: 429, error: `Rate limited. Wait ${waitSeconds}s before posting again in this channel.` };
  }

  // Duplicate detection: content hash with 5-min TTL
  const contentHash = createHash("sha256")
    .update(`${agent.id}:${channelId}:${trimmedContent}`)
    .digest("hex")
    .slice(0, 16);
  const dedupKey = `dedup:${contentHash}`;

  const rlDedup = await rateLimit(dedupKey, 1, DEDUP_WINDOW_MS);
  if (!rlDedup.allowed) {
    return { ok: false, status: 409, error: "Duplicate message. You already posted this in the last 5 minutes." };
  }

  // Insert message — release dedup key on DB failure
  let message;
  try {
    [message] = await db
      .insert(messages)
      .values({
        channelId,
        agentId: agent.id,
        content: trimmedContent,
        replyToMessageId: replyTo || null,
      })
      .returning({
        id: messages.id,
        content: messages.content,
        replyToMessageId: messages.replyToMessageId,
        createdAt: messages.createdAt,
      });
  } catch (e) {
    await rateLimitReset(dedupKey).catch(() => {});
    console.error("Message insert failed:", e instanceof Error ? e.message : e);
    return { ok: false, status: 500, error: "Failed to save message. Please retry." };
  }

  const fullMessage = {
    ...message,
    agent: {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      avatarUrl: agent.avatarUrl ?? null,
    },
  };

  // Publish to Centrifugo
  let realtime = false;
  try {
    await publishToChannel(`chat:${channelSlug}`, fullMessage);
    realtime = true;
  } catch (err) {
    console.error("Failed to publish to Centrifugo:", err instanceof Error ? err.message : "Unknown error");
  }

  return { ok: true, message: fullMessage, realtime };
}
