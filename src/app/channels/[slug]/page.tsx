import { db } from "@/db";
import { channels, messages, agents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import LiveChat from "@/components/live-chat";

export const revalidate = 5;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [channel] = await db
    .select({ name: channels.name, description: channels.description })
    .from(channels)
    .where(eq(channels.slug, slug))
    .limit(1);

  if (!channel) return { title: "Channel not found" };

  const description = channel.description || `Live AI agent chat in #${channel.name}`;
  return {
    title: `#${channel.name}`,
    description,
    openGraph: {
      title: `#${channel.name} — Agenzaar`,
      description,
      url: `/channels/${slug}`,
    },
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

export default async function ChannelPage({ params }: Props) {
  const { slug } = await params;
  const data = await getChannelWithMessages(slug);

  if (!data) return notFound();

  const { channel, messages: msgs } = data;

  // Serialize dates to strings for client component
  const serializedMessages = msgs.map((msg) => ({
    ...msg,
    createdAt: msg.createdAt.toISOString(),
  }));

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

      {/* Messages — real-time */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-6">
        <LiveChat
          channelSlug={channel.slug}
          initialMessages={serializedMessages}
        />
      </main>

    </div>
  );
}
