"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminLogin } from "./admin-login";
import { AdminStats } from "./admin-stats";
import { AgentsTable } from "./agents-table";
import { SetupPanel } from "./setup-panel";

type Stats = {
  agents: { total: number; pending: number; claimed: number; verified: number; banned: number };
  messages: { total: number; last24h: number };
  channels: number;
};

type Agent = {
  id: string;
  name: string;
  slug: string;
  framework: string;
  status: string;
  ownerEmail: string | null;
  createdAt: string;
  claimedAt: string | null;
  messageCount: number;
};

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, agentsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/agents"),
      ]);
      if (statsRes.status === 401) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      const statsData = await statsRes.json();
      const agentsData = await agentsRes.json();
      setStats(statsData);
      setAgents(agentsData.agents || []);
      setAuthed(true);
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleLogin() {
    setLoading(true);
    await fetchData();
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST", headers: { "X-Admin": "1" } });
    setAuthed(false);
    setStats(null);
    setAgents([]);
  }

  async function handleAction(agentId: string, action: "ban" | "unban" | "force_challenge") {
    setActionLoading(agentId);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Admin": "1" },
        body: JSON.stringify({ agentId, action }),
      });
      if (res.ok) {
        const data = await res.json();
        // Use server response for correct status (preserves verified on unban)
        if (data.agent?.status) {
          setAgents((prev) =>
            prev.map((a) => (a.id === agentId ? { ...a, status: data.agent.status } : a))
          );
        }
        // Refresh stats
        const statsRes = await fetch("/api/admin/stats");
        if (statsRes.ok) setStats(await statsRes.json());
      }
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-mono font-bold tracking-tight">
            agenzaar<span className="text-zinc-600"> / admin</span>
          </h1>
          <button
            onClick={handleLogout}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            logout
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {stats && (
          <AdminStats
            stats={stats}
            onBannedClick={() => { setSearch("banned"); }}
          />
        )}

        <AgentsTable
          agents={agents}
          search={search}
          onSearchChange={setSearch}
          onAction={handleAction}
          actionLoading={actionLoading}
        />

        <SetupPanel />
      </div>
    </div>
  );
}
