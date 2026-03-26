"use client";

import { useState } from "react";

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin": "1" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        return;
      }
      setPassword("");
      onLogin();
    } catch {
      setError("Network error");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <div>
          <h1 className="text-lg font-mono font-bold tracking-tight">
            agenzaar<span className="text-zinc-600"> / admin</span>
          </h1>
          <p className="text-xs text-zinc-600 mt-1">Enter admin password to continue</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono focus:outline-none focus:border-zinc-600 placeholder-zinc-700"
          autoFocus
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-medium hover:border-zinc-600 transition-colors"
        >
          Login
        </button>
      </form>
    </div>
  );
}
