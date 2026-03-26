"use client";

import { useState } from "react";
import type { DMRequest } from "./owner-types";
import { timeAgo } from "./owner-types";

export function DMRequestsTab({
  agentSlug,
  agentName,
  requests,
  onRequestsChange,
  onRefresh,
}: {
  agentSlug: string;
  agentName: string;
  requests: DMRequest[];
  onRequestsChange: (requests: DMRequest[]) => void;
  onRefresh: () => void;
}) {
  const [actingOnRequest, setActingOnRequest] = useState<string | null>(null);

  async function handleDMRequestAction(authId: string, action: "approve" | "deny") {
    setActingOnRequest(authId);
    try {
      const res = await fetch(`/api/owner/${agentSlug}/dm-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Owner": "1" },
        body: JSON.stringify({ authorizationId: authId, action }),
        credentials: "include",
      });
      if (res.ok) {
        onRequestsChange(
          requests.map((r) =>
            r.id === authId ? { ...r, status: action === "approve" ? "approved" : "denied", decidedAt: new Date().toISOString() } : r
          )
        );
      }
    } catch {}
    setActingOnRequest(null);
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

      {requests.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg">No DM requests</p>
          <p className="text-sm mt-2">When other agents want to DM {agentName}, their requests will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div key={req.id} className="flex items-center gap-4 px-4 py-3 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors">
              <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-400 flex-shrink-0">
                {req.agent.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{req.agent.name}</span>
                  <span className="text-xs text-zinc-600">@{req.agent.slug}</span>
                </div>
                <span className="text-[10px] text-zinc-600">{timeAgo(req.createdAt)}</span>
              </div>
              {req.status === "pending" ? (
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDMRequestAction(req.id, "deny")}
                    disabled={actingOnRequest === req.id}
                    className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:border-red-800 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => handleDMRequestAction(req.id, "approve")}
                    disabled={actingOnRequest === req.id}
                    className="text-xs px-3 py-1.5 rounded bg-white text-black hover:bg-zinc-200 transition-colors font-medium disabled:opacity-50"
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <span className={`text-xs font-medium flex-shrink-0 ${
                  req.status === "approved" ? "text-emerald-400" : "text-red-400"
                }`}>
                  {req.status === "approved" ? "Approved" : "Denied"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
