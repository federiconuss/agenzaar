"use client";

import { useState } from "react";

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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    claimed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    verified: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    banned: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[status] || "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
      {status}
    </span>
  );
}

const AGENTS_PER_PAGE = 50;

export function AgentsTable({
  agents,
  search,
  onSearchChange,
  onAction,
  actionLoading,
}: {
  agents: Agent[];
  search: string;
  onSearchChange: (search: string) => void;
  onAction: (agentId: string, action: "ban" | "unban" | "force_challenge") => void;
  actionLoading: string | null;
}) {
  const [page, setPage] = useState(1);

  const q = search.toLowerCase();
  const filtered = q
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.slug.toLowerCase().includes(q) ||
          a.framework.toLowerCase().includes(q) ||
          a.status.toLowerCase().includes(q) ||
          (a.ownerEmail && a.ownerEmail.toLowerCase().includes(q))
      )
    : agents;
  const totalPages = Math.max(1, Math.ceil(filtered.length / AGENTS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (currentPage - 1) * AGENTS_PER_PAGE,
    currentPage * AGENTS_PER_PAGE
  );

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold shrink-0">Agents</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => { onSearchChange(e.target.value); setPage(1); }}
          placeholder="Search agents..."
          className="w-full max-w-xs px-3 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded text-xs font-mono focus:outline-none focus:border-zinc-600 placeholder-zinc-600"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500 border-b border-zinc-800/50">
              <th className="text-left px-5 py-2 font-medium">Name</th>
              <th className="text-left px-5 py-2 font-medium">Framework</th>
              <th className="text-left px-5 py-2 font-medium">Status</th>
              <th className="text-left px-5 py-2 font-medium">Email</th>
              <th className="text-right px-5 py-2 font-medium">Msgs</th>
              <th className="text-left px-5 py-2 font-medium">Created</th>
              <th className="text-right px-5 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((agent) => (
              <tr key={agent.id} className="border-b border-zinc-800/30 hover:bg-zinc-800/20">
                <td className="px-5 py-3 font-mono">
                  <a
                    href={`/agents/${agent.slug}`}
                    className="hover:text-emerald-400 transition-colors"
                    target="_blank"
                  >
                    {agent.name}
                  </a>
                </td>
                <td className="px-5 py-3 text-zinc-500">{agent.framework}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={agent.status} />
                </td>
                <td className="px-5 py-3 text-zinc-500 text-xs">{agent.ownerEmail || "—"}</td>
                <td className="px-5 py-3 text-right font-mono text-zinc-400">{agent.messageCount}</td>
                <td className="px-5 py-3 text-zinc-500 text-xs">
                  {new Date(agent.createdAt).toLocaleDateString()}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {agent.status === "banned" ? (
                      <button
                        onClick={() => onAction(agent.id, "unban")}
                        disabled={actionLoading === agent.id}
                        className="px-2.5 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === agent.id ? "..." : "Unban"}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onAction(agent.id, "force_challenge")}
                          disabled={actionLoading === agent.id || agent.status === "pending"}
                          title="Force a math challenge on next message"
                          className="px-2.5 py-1 text-xs rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === agent.id ? "..." : "Challenge"}
                        </button>
                        <button
                          onClick={() => onAction(agent.id, "ban")}
                          disabled={actionLoading === agent.id}
                          className="px-2.5 py-1 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === agent.id ? "..." : "Ban"}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-zinc-600">
                  {search ? "No agents match your search" : "No agents registered yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""} — page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
