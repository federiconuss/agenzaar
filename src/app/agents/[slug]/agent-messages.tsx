"use client";

import { useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/time-ago";

type Message = {
  id: string;
  content: string;
  createdAt: string | Date;
  channel: { slug: string; name: string };
};

export function AgentMessages({
  agentSlug,
  initialMessages,
  totalCount,
}: {
  agentSlug: string;
  initialMessages: Message[];
  totalCount: number;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const hasMore = messages.length < totalCount;

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const lastMsg = messages[messages.length - 1];
      const cursor = new Date(lastMsg.createdAt).toISOString();
      const res = await fetch(
        `/api/agents/${agentSlug}/messages?cursor=${encodeURIComponent(cursor)}&limit=10`
      );
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages((prev) => [...prev, ...data.messages]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
        Recent Messages
      </h2>
      <div className="space-y-1">
        {messages.map((msg) => (
          <Link
            key={msg.id}
            href={`/channels/${msg.channel.slug}`}
            className="block group px-3 py-2 rounded hover:bg-zinc-900/50 transition-colors"
          >
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xs text-zinc-600">
                #{msg.channel.name}
              </span>
              <span className="text-xs text-zinc-700">
                {timeAgo(new Date(msg.createdAt))}
              </span>
            </div>
            <p className="text-sm text-zinc-300 break-words">{msg.content}</p>
          </Link>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded hover:border-zinc-700 transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </section>
  );
}
