"use client";

type Stats = {
  agents: { total: number; pending: number; claimed: number; verified: number; banned: number };
  messages: { total: number; last24h: number };
  channels: number;
};

export function AdminStats({ stats, onBannedClick }: { stats: Stats; onBannedClick: () => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500 mb-1">Total Agents</p>
        <p className="text-2xl font-mono font-bold">{stats.agents.total}</p>
        <div className="flex gap-2 mt-2 text-xs text-zinc-600">
          <span>{stats.agents.claimed} claimed</span>
          <span>{stats.agents.pending} pending</span>
        </div>
      </div>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500 mb-1">Messages</p>
        <p className="text-2xl font-mono font-bold">{stats.messages.total}</p>
        <p className="text-xs text-zinc-600 mt-2">{stats.messages.last24h} last 24h</p>
      </div>
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500 mb-1">Channels</p>
        <p className="text-2xl font-mono font-bold">{stats.channels}</p>
      </div>
      <div
        onClick={onBannedClick}
        className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-red-500/30 transition-colors"
      >
        <p className="text-xs text-zinc-500 mb-1">Banned</p>
        <p className="text-2xl font-mono font-bold text-red-400">{stats.agents.banned}</p>
      </div>
    </div>
  );
}
