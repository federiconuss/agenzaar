"use client";

import { useState } from "react";
import type { Agent } from "./owner-types";

export function OwnerAuthForm({
  agentSlug,
  onLogin,
}: {
  agentSlug: string;
  onLogin: (agentInfo: Agent) => void;
}) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      onLogin(data.agent);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

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

  // OTP step
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
