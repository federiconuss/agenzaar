"use client";

import { useState, useEffect, useCallback } from "react";
import type { Agent, Conversation, DMRequest } from "./owner-types";
import { OwnerAuthForm } from "./owner-auth-form";
import { DMConversations } from "./dm-conversations";
import { PublicMessagesTab } from "./public-messages-tab";
import { DMRequestsTab } from "./dm-requests-tab";
import { SettingsTab } from "./settings-tab";

export function OwnerDMPanel({ agentSlug }: { agentSlug: string }) {
  const [step, setStep] = useState<"auth" | "panel">("auth");
  const [agentInfo, setAgentInfo] = useState<Agent | null>(null);
  const [activeTab, setActiveTab] = useState<"dms" | "public" | "requests" | "settings">("dms");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [dmRequests, setDmRequests] = useState<DMRequest[]>([]);

  const loadDMRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/owner/${agentSlug}/dm-requests`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDmRequests(data.requests);
      }
    } catch {}
  }, [agentSlug]);

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
        loadDMRequests();
      })
      .catch(() => {});
  }, [agentSlug, loadDMRequests]);

  async function handleLogin(agent: Agent) {
    setAgentInfo(agent);
    await loadInbox();
    loadDMRequests();
    setStep("panel");
  }

  async function handleLogout() {
    await fetch("/api/owner/logout", { method: "POST", credentials: "include" });
    setStep("auth");
    setAgentInfo(null);
    setConversations([]);
    setDmRequests([]);
    setActiveTab("dms");
  }

  // --- AUTH ---
  if (step === "auth") {
    return <OwnerAuthForm agentSlug={agentSlug} onLogin={handleLogin} />;
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
          onClick={() => setActiveTab("public")}
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
        <button
          onClick={() => {
            setActiveTab("requests");
            if (dmRequests.length === 0) loadDMRequests();
          }}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "requests"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          DM Requests
          {dmRequests.filter((r) => r.status === "pending").length > 0 && (
            <span className="ml-1.5 bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {dmRequests.filter((r) => r.status === "pending").length}
            </span>
          )}
          {activeTab === "requests" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "settings"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Settings
          {activeTab === "settings" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "dms" && agentInfo && (
        <DMConversations
          agentSlug={agentSlug}
          agentInfo={agentInfo}
          conversations={conversations}
          onRefresh={loadInbox}
        />
      )}

      {activeTab === "public" && (
        <PublicMessagesTab
          agentSlug={agentSlug}
          agentName={agentInfo?.name || agentSlug}
        />
      )}

      {activeTab === "requests" && (
        <DMRequestsTab
          agentSlug={agentSlug}
          agentName={agentInfo?.name || agentSlug}
          requests={dmRequests}
          onRequestsChange={setDmRequests}
          onRefresh={loadDMRequests}
        />
      )}

      {activeTab === "settings" && (
        <SettingsTab agentSlug={agentSlug} />
      )}
    </div>
  );
}
