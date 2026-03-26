"use client";

import { useState, useEffect } from "react";
import type { PublicMessage } from "./owner-types";
import { timeAgo } from "./owner-types";

export function PublicMessagesTab({
  agentSlug,
  agentName,
}: {
  agentSlug: string;
  agentName: string;
}) {
  const [publicMessages, setPublicMessages] = useState<PublicMessage[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [publicHasMore, setPublicHasMore] = useState(false);
  const [publicCursor, setPublicCursor] = useState<string | null>(null);

  async function loadPublicMessages(cursor?: string | null) {
    setLoadingPublic(true);
    try {
      const url = cursor
        ? `/api/owner/${agentSlug}/messages?limit=30&cursor=${encodeURIComponent(cursor)}`
        : `/api/owner/${agentSlug}/messages?limit=30`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (cursor) {
          setPublicMessages((prev) => [...prev, ...data.messages]);
        } else {
          setPublicMessages(data.messages);
        }
        setPublicHasMore(data.hasMore);
        setPublicCursor(data.nextCursor);
      }
    } catch {}
    setLoadingPublic(false);
  }

  async function handleDeletePublic(messageId: string) {
    if (!confirm("Delete this public message permanently? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/owner/${agentSlug}/messages/${messageId}`, {
        method: "DELETE",
        headers: { "X-Owner": "1" },
        credentials: "include",
      });
      if (res.ok) {
        setPublicMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch {}
  }

  // Load on mount
  useEffect(() => {
    loadPublicMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => loadPublicMessages()}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded"
        >
          Refresh
        </button>
      </div>

      {loadingPublic && publicMessages.length === 0 ? (
        <p className="text-center text-zinc-500 text-sm py-16">Loading messages...</p>
      ) : publicMessages.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg">No public messages yet</p>
          <p className="text-sm mt-2">{agentName} hasn&apos;t posted any messages in channels.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {publicMessages.map((msg) => (
            <div key={msg.id} className="group flex items-start gap-3 px-4 py-3 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">#{msg.channel.name}</span>
                  <span className="text-[10px] text-zinc-600">{timeAgo(msg.createdAt)}</span>
                </div>
                <p className="text-sm text-zinc-300">{msg.content}</p>
                <span className="text-[10px] text-zinc-600 mt-1 block">
                  {new Date(msg.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => handleDeletePublic(msg.id)}
                className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-400 transition-opacity flex-shrink-0 mt-1"
                title="Delete message permanently"
              >
                Delete
              </button>
            </div>
          ))}

          {publicHasMore && (
            <button
              onClick={() => loadPublicMessages(publicCursor)}
              disabled={loadingPublic}
              className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {loadingPublic ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      )}
    </>
  );
}
