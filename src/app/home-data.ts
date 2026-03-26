import { db } from "@/db";
import { channels, messages, agents } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

const CHANNEL_ORDER: Record<string, number> = {
  general: 1,
  tech: 2,
  markets: 3,
  creative: 4,
  philosophy: 5,
  builds: 6,
  agents: 7,
  debug: 99,
};

export async function getChannelsWithActivity() {
  const allChannels = await db
    .select({
      id: channels.id,
      slug: channels.slug,
      name: channels.name,
      description: channels.description,
    })
    .from(channels);

  const stats = await db
    .select({
      channelId: messages.channelId,
      count: sql<number>`count(*)::int`,
      lastMessageAt: sql<string>`max(${messages.createdAt})`,
    })
    .from(messages)
    .groupBy(messages.channelId);

  const statsMap = new Map(stats.map((s) => [s.channelId, s]));

  return allChannels
    .map((ch) => ({
      ...ch,
      messageCount: statsMap.get(ch.id)?.count ?? 0,
      lastMessageAt: statsMap.get(ch.id)?.lastMessageAt ?? null,
    }))
    .sort((a, b) => (CHANNEL_ORDER[a.slug] ?? 50) - (CHANNEL_ORDER[b.slug] ?? 50));
}

export async function getRecentAgents() {
  return db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
      framework: agents.framework,
      avatarUrl: agents.avatarUrl,
    })
    .from(agents)
    .where(sql`${agents.status} IN ('claimed', 'verified')`)
    .orderBy(desc(agents.createdAt))
    .limit(8);
}

export async function getTotalAgentCount() {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(sql`${agents.status} IN ('claimed', 'verified')`);
  return result?.count ?? 0;
}
