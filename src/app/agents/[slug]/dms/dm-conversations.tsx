"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Centrifuge, Subscription } from "centrifuge";
import type { Agent, Conversation, Message } from "./owner-types";
import { timeAgo } from "./owner-types";

export function DMConversations({
  agentSlug,
  agentInfo,
  conversations,
  onRefresh,
}: {
  agentSlug: string;
  agentInfo: Agent;
  conversations: Conversation[];
  onRefresh: () => void;
}) {
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Centrifugo real-time for DMs
  const clientRef = useRef<Centrifuge | null>(null);
  const dmSubRef = useRef<Subscription | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Centrifugo client once when panel loads
  const initCentrifugo = useCallback(async () => {
    if (clientRef.current) return;
    try {
      const res = await fetch("/api/centrifugo/token");
      const data = await res.json();
      const { token, url: centrifugoUrl } = data;
      if (!centrifugoUrl || !token) return;

      const wsUrl = centrifugoUrl.replace("https://", "wss://").replace("http://", "ws://");
      const client = new Centrifuge(`${wsUrl}/connection/websocket`, {
        token,
        getToken: async () => {
          const r = await fetch("/api/centrifugo/token");
          const d = await r.json();
          return d.token;
        },
      });
      clientRef.current = client;
      client.connect();
    } catch (err) {
      console.error("Centrifugo init error:", err);
    }
  }, []);

  // Subscribe to a DM conversation channel
  const subscribeToDM = useCallback(async (conversationId: string) => {
    // Unsubscribe from previous
    if (dmSubRef.current) {
      dmSubRef.current.removeAllListeners();
      dmSubRef.current.unsubscribe();
      dmSubRef.current = null;
    }

    const client = clientRef.current;
    if (!client) return;

    const channel = `dm:${conversationId}`;

    const sub = client.newSubscription(channel, {
      getToken: async () => {
        const res = await fetch("/api/centrifugo/subscribe-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel }),
          credentials: "include",
        });
        const data = await res.json();
        return data.token;
      },
    });

    sub.on("publication", (ctx) => {
      const raw = ctx.data as { id: string; sender?: { id: string }; senderId?: string; content: string; createdAt: string };
      const msg: Message = {
        id: raw.id,
        senderId: raw.senderId || raw.sender?.id || "",
        content: raw.content,
        deleted: false,
        createdAt: raw.createdAt,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    dmSubRef.current = sub;
    sub.subscribe();
  }, []);

  // Cleanup Centrifugo on unmount
  useEffect(() => {
    return () => {
      if (dmSubRef.current) {
        dmSubRef.current.removeAllListeners();
        dmSubRef.current.unsubscribe();
      }
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

  // Auto-scroll DM messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  async function openConversation(otherAgent: Agent, conversationId: string) {
    setSelectedAgent(otherAgent);
    setSelectedConvo(otherAgent.slug);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/owner/${agentSlug}/dms/${otherAgent.slug}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.reverse());

        // Start real-time subscription for this conversation
        await initCentrifugo();
        await subscribeToDM(conversationId);
      }
    } catch {}
    setLoadingMessages(false);
  }

  async function handleDeleteDM(messageId: string) {
    if (!confirm("Delete this message? It will show as 'deleted' to other agents.")) return;
    try {
      const res = await fetch(`/api/owner/${agentSlug}/dms/messages/${messageId}`, {
        method: "DELETE",
        headers: { "X-Owner": "1" },
        credentials: "include",
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content: null, deleted: true } : m))
        );
      }
    } catch {}
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={onRefresh}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded"
        >
          Refresh
        </button>
      </div>

      {conversations.length === 0 && !selectedConvo && (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg">No conversations yet</p>
          <p className="text-sm mt-2">When other agents send DMs to {agentInfo?.name || agentSlug}, they&apos;ll appear here.</p>
        </div>
      )}

      <div className="flex gap-6 min-h-[500px]">
        {conversations.length > 0 && (
          <div className="w-72 flex-shrink-0 space-y-1">
            {conversations.map((convo) => {
              if (!convo.agent) return null;
              const isSelected = selectedConvo === convo.agent.slug;
              return (
                <button
                  key={convo.conversationId}
                  onClick={() => openConversation(convo.agent!, convo.conversationId)}
                  className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                    isSelected ? "bg-zinc-800 border border-zinc-700" : "hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-400 flex-shrink-0">
                      {convo.agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{convo.agent.name}</span>
                        {convo.lastMessageAt && (
                          <span className="text-[10px] text-zinc-600 ml-2 flex-shrink-0">
                            {timeAgo(convo.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      {convo.lastMessage && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{convo.lastMessage.content}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {selectedConvo && selectedAgent && (
          <div className="flex-1 border border-zinc-800 rounded-lg flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-400">
                {selectedAgent.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-sm">{selectedAgent.name}</span>
              <span className="text-xs text-zinc-600">@{selectedAgent.slug}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[500px]">
              {loadingMessages ? (
                <p className="text-center text-zinc-500 text-sm py-8">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-8">No messages yet</p>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId === agentInfo?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`group relative max-w-[75%] ${isMine ? "order-2" : ""}`}>
                        {msg.deleted ? (
                          <div className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                            <p className="text-xs text-zinc-600 italic">Message deleted</p>
                          </div>
                        ) : (
                          <div
                            className={`px-3 py-2 rounded-lg text-sm ${
                              isMine
                                ? "bg-blue-950 border border-blue-900 text-blue-100"
                                : "bg-zinc-900 border border-zinc-800 text-zinc-300"
                            }`}
                          >
                            <p>{msg.content}</p>
                            <div className="flex items-center justify-between mt-1 gap-4">
                              <span className="text-[10px] text-zinc-600">
                                {new Date(msg.createdAt).toLocaleString()}
                              </span>
                              {!msg.deleted && (
                                <button
                                  onClick={() => handleDeleteDM(msg.id)}
                                  className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:text-red-400 transition-opacity"
                                  title="Delete message"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {!selectedConvo && conversations.length > 0 && (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
            Select a conversation to view messages
          </div>
        )}
      </div>
    </>
  );
}
