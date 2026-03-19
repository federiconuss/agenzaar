"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

type ConnectionMode = "connecting" | "live" | "polling";

export default function LiveChat({ channelSlug, initialMessages }: LiveChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [mode, setMode] = useState<ConnectionMode>("connecting");
  const [newCount, setNewCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsFailCount = useRef(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Merge new messages avoiding duplicates
  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newMsgs = incoming.filter((m) => !existingIds.has(m.id));
      if (newMsgs.length === 0) return prev;
      setNewCount((c) => c + newMsgs.length);
      setTimeout(() => setNewCount((c) => Math.max(0, c - newMsgs.length)), 3000);
      return [...prev, ...newMsgs];
    });
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Polling fallback: fetch messages from API every 5 seconds
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    setMode("polling");

    const poll = async () => {
      try {
        const res = await fetch(`/api/channels/${channelSlug}/messages?limit=50`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages && Array.isArray(data.messages)) {
            // API returns newest first, reverse for chronological order
            const sorted = [...data.messages].reverse();
            mergeMessages(sorted);
          }
        }
      } catch {
        // Silently retry on next interval
      }
    };

    poll(); // Immediate first poll
    pollRef.current = setInterval(poll, 5000);
  }, [channelSlug, mergeMessages]);

  // Connect to Centrifugo (with fallback to polling)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: NodeJS.Timeout;
    let destroyed = false;

    async function connect() {
      if (destroyed) return;

      // If WebSocket failed too many times, switch to polling
      if (wsFailCount.current >= 2) {
        console.log("[live-chat] WebSocket failed, switching to polling");
        startPolling();
        return;
      }

      try {
        const tokenRes = await fetch("/api/centrifugo/token");
        const tokenData = await tokenRes.json();
        const { token, url: centrifugoUrl } = tokenData;

        if (!centrifugoUrl || !token) {
          console.warn("[live-chat] Centrifugo not configured, using polling");
          startPolling();
          return;
        }

        // Connect via WebSocket
        const wsUrl = centrifugoUrl.replace("https://", "wss://").replace("http://", "ws://");
        ws = new WebSocket(`${wsUrl}/connection/websocket`);
        wsRef.current = ws;

        const connectTimeout = setTimeout(() => {
          if (ws?.readyState !== WebSocket.OPEN) {
            console.log("[live-chat] WebSocket connect timeout");
            ws?.close();
          }
        }, 5000);

        ws.onopen = () => {
          clearTimeout(connectTimeout);
          ws!.send(
            JSON.stringify({
              id: 1,
              connect: { token, name: "web-viewer" },
            })
          );
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.error) {
            console.error("[centrifugo] error:", data.error);
            return;
          }

          // Handle connect response
          if (data.id === 1 && data.connect) {
            wsFailCount.current = 0; // Reset fail count on successful connect
            setMode("live");
            // Stop polling if it was running
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            // Subscribe to channel
            ws!.send(
              JSON.stringify({
                id: 2,
                subscribe: { channel: `chat:${channelSlug}` },
              })
            );
          }

          // Handle subscription publications (new messages)
          if (data.push?.pub?.data) {
            const msg = data.push.pub.data as Message;
            mergeMessages([msg]);
          }
        };

        ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          console.log("[centrifugo] closed:", event.code, event.reason);
          setMode("connecting");
          wsFailCount.current++;

          if (!destroyed) {
            if (wsFailCount.current >= 2) {
              startPolling();
            } else {
              setTimeout(connect, 3000);
            }
          }
        };

        ws.onerror = () => {
          clearTimeout(connectTimeout);
          setMode("connecting");
        };

        // Ping to keep alive
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({}));
          }
        }, 25000);
      } catch (err) {
        console.error("[live-chat] connection error:", err);
        wsFailCount.current++;
        if (!destroyed) {
          if (wsFailCount.current >= 2) {
            startPolling();
          } else {
            setTimeout(connect, 5000);
          }
        }
      }
    }

    connect();

    return () => {
      destroyed = true;
      clearInterval(pingInterval);
      if (ws) ws.close();
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [channelSlug, startPolling, mergeMessages]);

  const statusColor = mode === "live" ? "bg-emerald-500" : mode === "polling" ? "bg-amber-500" : "bg-zinc-600";
  const statusText = mode === "live" ? "live" : mode === "polling" ? "auto-refresh" : "connecting...";

  return (
    <div className="flex flex-col h-full">
      {/* Connection status */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-600">
        <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
        {statusText}
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
