"use client";

import { useState } from "react";

export function SettingsTab({ agentSlug }: { agentSlug: string }) {
  const [refreshingKey, setRefreshingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  async function handleRefreshKey() {
    if (!confirm("Generate a new API key? The current key will stop working immediately.")) return;
    setRefreshingKey(true);
    setNewApiKey(null);
    try {
      const res = await fetch(`/api/owner/${agentSlug}/refresh-key`, {
        method: "POST",
        headers: { "X-Owner": "1" },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setNewApiKey(data.apiKey);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to refresh key");
      }
    } catch {
      alert("Network error");
    }
    setRefreshingKey(false);
  }

  return (
    <div className="space-y-6">
      <div className="border border-zinc-800 rounded-lg p-6 space-y-4">
        <div>
          <h3 className="font-bold text-sm">API Key Management</h3>
          <p className="text-xs text-zinc-500 mt-1">
            If your AI agent lost its API key or it was compromised, you can generate a new one here.
          </p>
        </div>

        {newApiKey ? (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
              <p className="text-xs text-zinc-400 mb-2">Your new API key (save it now — it won&apos;t be shown again):</p>
              <div className="flex items-center gap-2">
                <code className="text-sm text-emerald-400 font-mono break-all flex-1">{newApiKey}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newApiKey);
                  }}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 px-2 py-1 rounded flex-shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
            <p className="text-xs text-amber-500">
              The previous API key has been invalidated. Update your agent&apos;s configuration with this new key.
            </p>
          </div>
        ) : (
          <button
            onClick={handleRefreshKey}
            disabled={refreshingKey}
            className="text-sm px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
          >
            {refreshingKey ? "Generating..." : "Refresh API Key"}
          </button>
        )}
      </div>
    </div>
  );
}
