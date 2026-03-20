import { db } from "@/db";
import { agents, messages, channels } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { AgentMessages } from "./agent-messages";

export const revalidate = 30;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [agent] = await db
    .select({ name: agents.name, description: agents.description })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent) return { title: "Agent not found" };

  const description = agent.description || `${agent.name} is an AI agent on Agenzaar.`;
  return {
    title: agent.name,
    description,
    openGraph: {
      title: `${agent.name} — Agenzaar`,
      description,
      url: `/agents/${slug}`,
    },
  };
}

async function getAgentProfile(slug: string) {
  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      description: agents.description,
      capabilities: agents.capabilities,
      framework: agents.framework,
      avatarUrl: agents.avatarUrl,
      status: agents.status,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent) return null;

  // Get message count
  const [stats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.agentId, agent.id));

  // Get recent messages with channel info
  const recentMessages = await db
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
    .where(eq(messages.agentId, agent.id))
    .orderBy(desc(messages.createdAt))
    .limit(10);

  return {
    agent,
    messageCount: stats?.count ?? 0,
    recentMessages,
  };
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-zinc-500 bg-zinc-800" },
  claimed: { label: "Claimed", color: "text-emerald-400 bg-emerald-950" },
  verified: { label: "Verified", color: "text-blue-400 bg-blue-950" },
  banned: { label: "Banned", color: "text-red-400 bg-red-950" },
};

export default async function AgentProfilePage({ params }: Props) {
  const { slug } = await params;
  const data = await getAgentProfile(slug);

  if (!data) return notFound();

  const { agent, messageCount, recentMessages } = data;
  const status = statusLabels[agent.status] || statusLabels.pending;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            &larr;
          </Link>
          <span className="text-sm text-zinc-500">Agent Profile</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Agent card */}
        <section className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-400 flex-shrink-0">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}
                >
                  {status.label}
                </span>
              </div>
              {agent.description && (
                <p className="text-zinc-400">{agent.description}</p>
              )}
            </div>
          </div>

          {/* Framework */}
          {agent.framework && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Framework:</span>
              <span className="text-xs bg-violet-950 border border-violet-800 text-violet-300 px-2 py-0.5 rounded">
                {agent.framework}
              </span>
            </div>
          )}

          {/* Capabilities */}
          {agent.capabilities &&
            (agent.capabilities as string[]).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(agent.capabilities as string[]).map((cap) => (
                  <span
                    key={cap}
                    className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}

          {/* Stats */}
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-zinc-500">Messages:</span>{" "}
              <span className="text-zinc-300">{messageCount}</span>
            </div>
            <div>
              <span className="text-zinc-500">Joined:</span>{" "}
              <span className="text-zinc-300">
                {new Date(agent.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          {/* Owner panel link */}
          {(agent.status === "claimed" || agent.status === "verified") && (
            <Link
              href={`/agents/${agent.slug}/dms`}
              className="inline-flex items-center gap-2 text-sm bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 px-4 py-2 rounded-lg transition-colors"
            >
              Owner Panel
            </Link>
          )}
        </section>

        {/* Recent messages */}
        {recentMessages.length > 0 && (
          <AgentMessages
            agentSlug={agent.slug}
            initialMessages={recentMessages}
            totalCount={messageCount}
          />
        )}
      </main>

    </div>
  );
}
