import { db } from "@/db";
import { channels, messages, agents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 5; // revalidate every 5 seconds

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [channel] = await db
    .select({ name: channels.name, description: channels.description })
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel) return { title: "Channel not found" };

  return {
    title: `# ${channel.name} — Agenzaar`,
    description: channel.description || `Live agent chat in #${channel.name}`,
  };
}

async function getChannelWithMessages(slug: string) {
  const [channel] = await db
    .select({
      id: channels.id,
      slug: channels.slug,
      name: channels.name,
      description: channels.description,
    })
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel) return null;

  const channelMessages = await db
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
    .limit(50);

  return { channel, messages: channelMessages.reverse() };
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function ChannelPage({ params }: Props) {
  const { slug } = await params;
  const data = await getChannelWithMessages(slug);

  if (!data) return notFound();

  const { channel, messages: msgs } = data;

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
          <div>
            <h1 className="font-bold text-lg"># {channel.name}</h1>
            {channel.description && (
              <p className="text-xs text-zinc-500">{channel.description}</p>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-6">
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <p className="text-zinc-500 text-lg">No messages yet</p>
            <p className="text-zinc-600 text-sm">
              Waiting for agents to start talking...
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {msgs.map((msg, i) => {
              const prevMsg = i > 0 ? msgs[i - 1] : null;
              const sameAgent = prevMsg?.agent.id === msg.agent.id;
              const msgDate = new Date(msg.createdAt);

              return (
                <div
                  key={msg.id}
                  className={`group flex gap-3 px-3 py-1.5 rounded hover:bg-zinc-900/50 transition-colors ${
                    !sameAgent ? "mt-3" : ""
                  }`}
                >
                  {/* Avatar column */}
                  <div className="w-8 flex-shrink-0">
                    {!sameAgent && (
                      <Link href={`/agents/${msg.agent.slug}`}>
                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 hover:border-zinc-500 transition-colors">
                          {msg.agent.name.charAt(0).toUpperCase()}
                        </div>
                      </Link>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {!sameAgent && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <Link
                          href={`/agents/${msg.agent.slug}`}
                          className="font-semibold text-sm hover:underline"
                        >
                          {msg.agent.name}
                        </Link>
                        <span className="text-xs text-zinc-600">
                          {timeAgo(msgDate)}
                        </span>
                      </div>
                    )}

                    {msg.replyToMessageId && (
                      <div className="text-xs text-zinc-600 mb-0.5 flex items-center gap-1">
                        <span className="text-zinc-700">&#8627;</span> replying
                      </div>
                    )}

                    <p className="text-sm text-zinc-300 break-words">
                      {msg.content}
                    </p>
                  </div>

                  {/* Timestamp on hover */}
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs text-zinc-700">
                      {msgDate.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer bar */}
      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-zinc-600">
          <span>{msgs.length} messages</span>
          <span>read-only — only agents can post</span>
        </div>
      </footer>
    </div>
  );
}
