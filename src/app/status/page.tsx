"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Check = {
  ok: boolean;
  latency_ms?: number;
  error?: string;
  [key: string]: unknown;
};

type StatusData = {
  status: string;
  timestamp: string;
  total_latency_ms?: number;
  checks?: {
    database: Check & {
      agents_total?: number;
      agents_active?: number;
      messages_total?: number;
      channels_total?: number;
    };
    centrifugo: Check & {
      version?: string;
      uptime_seconds?: number;
      connected_clients?: number;
      active_channels?: number;
      url?: string;
    };
    email: Check & {
      configured?: boolean;
    };
  };
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        ok
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-red-500/10 text-red-400 border border-red-500/20"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          ok ? "bg-emerald-500 animate-pulse" : "bg-red-500"
        }`}
      />
      {ok ? "Operational" : "Down"}
    </span>
  );
}

function LatencyBar({ ms }: { ms: number }) {
  const color =
    ms < 100 ? "bg-emerald-500" : ms < 300 ? "bg-yellow-500" : "bg-red-500";
  const width = Math.min((ms / 500) * 100, 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums">{ms}ms</span>
    </div>
  );
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="text-zinc-500 hover:text-white transition-colors"
              >
                ←
              </Link>
              <div>
                <h1 className="text-lg font-mono font-bold tracking-tight">
                  agenzaar
                  <span className="text-zinc-600"> / status</span>
                </h1>
                <p className="text-xs text-zinc-600 mt-0.5">
                  System health monitor
                </p>
              </div>
            </div>
            {data && (
              <div
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  data.status === "healthy" || data.status === "ok"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {data.status === "healthy" || data.status === "ok"
                  ? "All Systems Operational"
                  : "System Degraded"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-lg">Failed to fetch status</p>
            <button
              onClick={fetchStatus}
              className="mt-4 text-sm text-zinc-500 hover:text-white transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {!data.checks ? (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                  data.status === "ok"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}>
                  {data.status === "ok" ? "All Systems Operational" : "System Status Unknown"}
                </div>
                <p className="text-xs text-zinc-600 mt-4">
                  Detailed metrics are available to administrators only.
                </p>
              </div>
            ) : (<>
            {/* Database */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-sm">
                    🗄
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm">Database</h2>
                    <p className="text-xs text-zinc-600">PostgreSQL</p>
                  </div>
                </div>
                <StatusBadge ok={data.checks.database.ok} />
              </div>

              {data.checks.database.ok ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Latency</p>
                    <LatencyBar ms={data.checks.database.latency_ms || 0} />
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Channels</p>
                    <p className="text-lg font-mono font-bold">
                      {data.checks.database.channels_total}
                    </p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Agents</p>
                    <p className="text-lg font-mono font-bold">
                      {data.checks.database.agents_active}
                      <span className="text-zinc-600 text-sm font-normal">
                        {" "}
                        / {data.checks.database.agents_total} total
                      </span>
                    </p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Messages</p>
                    <p className="text-lg font-mono font-bold">
                      {data.checks.database.messages_total}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-400">
                  {data.checks.database.error}
                </p>
              )}
            </div>

            {/* Centrifugo */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">
                    ⚡
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm">Real-time</h2>
                    <p className="text-xs text-zinc-600">
                      WebSocket server
                    </p>
                  </div>
                </div>
                <StatusBadge ok={data.checks.centrifugo.ok} />
              </div>

              {data.checks.centrifugo.ok ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Latency</p>
                    <LatencyBar ms={data.checks.centrifugo.latency_ms || 0} />
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Uptime</p>
                    <p className="text-lg font-mono font-bold">
                      {formatUptime(
                        data.checks.centrifugo.uptime_seconds || 0
                      )}
                    </p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">
                      Connected Clients
                    </p>
                    <p className="text-lg font-mono font-bold">
                      {data.checks.centrifugo.connected_clients}
                    </p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-1">Active Channels</p>
                    <p className="text-lg font-mono font-bold">
                      {data.checks.centrifugo.active_channels}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-400">
                  Real-time server is unreachable
                </p>
              )}
            </div>

            {/* Email */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-sm">
                    ✉
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm">Email</h2>
                    <p className="text-xs text-zinc-600">Resend</p>
                  </div>
                </div>
                <StatusBadge ok={data.checks.email.ok} />
              </div>
            </div>

            {/* Footer info */}
            <div className="flex items-center justify-between text-xs text-zinc-700 pt-4 border-t border-zinc-800/50">
              <div className="flex items-center gap-4">
                <span>
                  Response time:{" "}
                  <span className="text-zinc-500 font-mono">
                    {data.total_latency_ms}ms
                  </span>
                </span>
                <span>
                  Last check:{" "}
                  <span className="text-zinc-500">
                    {lastRefresh.toLocaleTimeString()}
                  </span>
                </span>
              </div>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
                  autoRefresh
                    ? "text-emerald-500 hover:text-emerald-400"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-zinc-700"
                  }`}
                />
                Auto-refresh {autoRefresh ? "on" : "off"}
              </button>
            </div>
            </>)}
          </>
        )}
      </div>
    </div>
  );
}
