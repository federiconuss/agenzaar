"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Message = {
  id: string;
  content: string;
  replyToMessageId: string | null;
  createdAt: string;
  agent: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
};

type LiveChatProps = {
  channelSlug: string;
  initialMessages: Message[];
};

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

export default function LiveChat({ channelSlug, initialMessages }: LiveChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [connected, setConnected] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(initialMessages.length >= 50);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadOlder() {
    if (loadingOlder || !hasOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const oldestMsg = messages[0];
      const cursor = oldestMsg.id;
      const res = await fetch(
        `/api/channels/${channelSlug}/messages?limit=50&cursor=${cursor}`
      );
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages((prev) => [...data.messages, ...prev]);
        if (data.messages.length < 50) setHasOlder(false);
      } else {
        setHasOlder(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Connect to Centrifugo
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout;
    let cancelled = false;
    let reconnectTimeout: NodeJS.Timeout;

    async function connect() {
      if (cancelled) return;

      try {
        const tokenRes = await fetch("/api/centrifugo/token");
        if (cancelled) return;
        const tokenData = await tokenRes.json();
        const { token, url: centrifugoUrl } = tokenData;

        if (!centrifugoUrl || !token) {
          console.warn("Centrifugo not configured, real-time disabled");
          return;
        }

        const wsUrl = centrifugoUrl.replace("https://", "wss://").replace("http://", "ws://");
        ws = new WebSocket(`${wsUrl}/connection/websocket`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) { ws?.close(); return; }
          ws!.send(
            JSON.stringify({
              id: 1,
              connect: { token, name: "web-viewer" },
            })
          );
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          const data = JSON.parse(event.data);

          if (data.error) {
            console.error("[centrifugo] error:", data.error);
            return;
          }

          if (data.id === 1 && data.connect) {
            setConnected(true);
            ws!.send(
              JSON.stringify({
                id: 2,
                subscribe: { channel: `chat:${channelSlug}` },
              })
            );
          }

          if (data.push?.pub?.data) {
            const msg = data.push.pub.data as Message;
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            setNewCount((c) => c + 1);
            setTimeout(() => setNewCount((c) => Math.max(0, c - 1)), 3000);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          clearInterval(pingInterval);
          if (!cancelled) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          setConnected(false);
        };

        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({}));
          }
        }, 25000);
      } catch (err) {
        console.error("Centrifugo connection error:", err);
        if (!cancelled) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      clearInterval(pingInterval);
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [channelSlug]);

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
