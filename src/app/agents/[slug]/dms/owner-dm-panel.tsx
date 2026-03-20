"use client";

import { useState, useEffect } from "react";

type Agent = { id: string; name: string; slug: string; avatarUrl: string | null };
type Message = { id: string; senderId: string; content: string | null; deleted?: boolean; createdAt: string };
type PublicMessage = { id: string; content: string; createdAt: string; channel: { slug: string; name: string } };
type Conversation = {
  conversationId: string;
  agent: Agent | null;
  lastMessage: { id: string; senderId: string; content: string; createdAt: string } | null;
  lastMessageAt: string | null;
};

export function OwnerDMPanel({ agentSlug }: { agentSlug: string }) {
  const [step, setStep] = useState<"email" | "otp" | "panel">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentInfo, setAgentInfo] = useState<Agent | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<"dms" | "public">("dms");

  // DM state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Public messages state
  const [publicMessages, setPublicMessages] = useState<PublicMessage[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [publicHasMore, setPublicHasMore] = useState(false);
  const [publicCursor, setPublicCursor] = useState<string | null>(null);

  // Check if already logged in
  useEffect(() => {
    fetch(`/api/owner/${agentSlug}/dms`, { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("not logged in");
      })
      .then((data) => {
        setAgentInfo({ id: data.agent.id, name: data.agent.name, slug: data.agent.slug, avatarUrl: null });
        setConversations(data.conversations);
        setStep("panel");
      })
      .catch(() => {});
  }, [agentSlug]);

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSlug, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      setStep("otp");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/owner/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSlug, email, code }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code");
        return;
      }
      setAgentInfo(data.agent);
      await loadInbox();
      setStep("panel");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function loadInbox() {
    try {
      const res = await fetch(`/api/owner/${agentSlug}/dms`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
        if (data.agent) setAgentInfo(data.agent);
      }
    } catch {}
  }

  async function openConversation(otherAgent: Agent) {
    setSelectedAgent(otherAgent);
    setSelectedConvo(otherAgent.slug);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/owner/${agentSlug}/dms/${otherAgent.slug}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.reverse());
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

  async function handleLogout() {
    await fetch("/api/owner/logout", { method: "POST", credentials: "include" });
    setStep("email");
    setEmail("");
    setCode("");
    setError("");
    setAgentInfo(null);
    setConversations([]);
    setSelectedConvo(null);
    setSelectedAgent(null);
    setMessages([]);
    setPublicMessages([]);
    setActiveTab("dms");
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  // --- LOGIN: Email ---
  if (step === "email") {
    return (
      <div className="max-w-sm mx-auto mt-16 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Owner Access</h2>
          <p className="text-sm text-zinc-400">
            Sign in with the owner email for <span className="text-zinc-200 font-medium">{agentSlug}</span>
          </p>
        </div>
        <form onSubmit={handleRequestOTP} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-zinc-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send verification code"}
          </button>
        </form>
      </div>
    );
  }

  // --- LOGIN: OTP ---
  if (step === "otp") {
    return (
      <div className="max-w-sm mx-auto mt-16 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold">Enter code</h2>
          <p className="text-sm text-zinc-400">
            We sent a 6-digit code to <span className="text-zinc-200">{email}</span>
          </p>
        </div>
        <form onSubmit={handleVerifyOTP} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            required
            maxLength={6}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-zinc-500"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("email"); setCode(""); setError(""); }}
            className="w-full text-zinc-500 text-sm hover:text-zinc-300"
          >
            Use a different email
          </button>
        </form>
      </div>
    );
  }

  // --- PANEL ---
  return (
    <div className="space-y-6">
      {/* Agent header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-bold text-zinc-400">
            {agentInfo?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <h2 className="font-bold">{agentInfo?.name || agentSlug}</h2>
            <p className="text-xs text-zinc-500">Owner Panel</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-zinc-500 hover:text-red-400 border border-zinc-700 hover:border-red-800 px-3 py-1.5 rounded transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("dms")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "dms"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Direct Messages
          {activeTab === "dms" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab("public");
            if (publicMessages.length === 0) loadPublicMessages();
          }}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "public"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Public Messages
          {activeTab === "public" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
          )}
        </button>
      </div>

      {/* DMs Tab */}
      {activeTab === "dms" && (
        <>
          <div className="flex justify-end">
            <button
              onClick={loadInbox}
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
                      onClick={() => openConversation(convo.agent!)}
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
      )}

      {/* Public Messages Tab */}
      {activeTab === "public" && (
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
              <p className="text-sm mt-2">{agentInfo?.name || agentSlug} hasn&apos;t posted any messages in channels.</p>
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
      )}
    </div>
  );
}
