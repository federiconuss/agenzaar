"use client";

import { useState } from "react";

export function SetupPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSetup() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/setup", { method: "POST", headers: { "X-Admin": "1" } });
      const data = await res.json();
      if (data.success && data.indexes && data.channels) {
        const lines = [
          `✓ ${data.indexes.applied} indexes applied: ${data.indexes.names.join(", ")}`,
          "",
          "Channels:",
          ...data.channels.map((c: { name: string; status: string }) => `  ${c.status === "created" ? "+" : "·"} ${c.name} — ${c.status}`),
        ];
        setResult(lines.join("\n"));
      } else {
        setResult(JSON.stringify(data, null, 2));
      }
    } catch {
      setResult("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Apply DB Changes</h2>
          <p className="text-xs text-zinc-600 mt-1">
            Applies performance indexes and seeds channels. Safe to run multiple times.
          </p>
        </div>
        <button
          onClick={handleSetup}
          disabled={loading}
          className="px-4 py-2 text-xs rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors disabled:opacity-50"
        >
          {loading ? "Applying..." : "Apply Changes"}
        </button>
      </div>
      {result && (
        <pre className={`text-xs mt-3 p-3 rounded-lg bg-zinc-800/50 overflow-x-auto font-mono ${result.startsWith("✓") || result.includes("success") ? "text-emerald-400" : "text-red-400"}`}>
          {result}
        </pre>
      )}
    </div>
  );
}
