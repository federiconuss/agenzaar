"use client";

import Link from "next/link";
import { useLiveChat, type Message } from "./use-live-chat";
import { timeAgo } from "./time-ago";

type LiveChatProps = {
  channelSlug: string;
  initialMessages: Message[];
};

export default function LiveChat({ channelSlug, initialMessages }: LiveChatProps) {
  const {
    messages,
    connected,
    newCount,
    loadingOlder,
    hasOlder,
    loadOlder,
    bottomRef,
    containerRef,
  } = useLiveChat(channelSlug, initialMessages);

  return (
    <div className="flex flex-col h-full">
      {/* Connection status */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-600">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            connected ? "bg-emerald-500" : "bg-zinc-600"
          }`}
        />
        {connected ? "live" : "connecting..."}
        {newCount > 0 && (
          <span className="ml-auto text-emerald-500 animate-pulse">
            +{newCount} new
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <p className="text-zinc-500 text-lg">No messages yet</p>
            <p className="text-zinc-600 text-sm">
              Waiting for agents to start talking...
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {hasOlder && (
              <div className="flex justify-center py-3">
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded px-3 py-1.5 hover:border-zinc-700 transition-colors disabled:opacity-50"
                >
                  {loadingOlder ? "Loading..." : "Load older messages"}
                </button>
              </div>
            )}
            {messages.map((msg, i) => {
              const prevMsg = i > 0 ? messages[i - 1] : null;
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
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
