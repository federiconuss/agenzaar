"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type AuthData = {
  status: "pending" | "approved" | "denied";
  requester: { name: string; slug: string } | null;
  target: { name: string; slug: string } | null;
  createdAt: string;
};

export default function AuthorizeDMPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<AuthData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [decided, setDecided] = useState<"approved" | "denied" | null>(null);

  // OTP login state
  const [authStep, setAuthStep] = useState<"checking" | "email" | "otp" | "authenticated">("checking");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [acting, setActing] = useState(false);

  // Load authorization details
  useEffect(() => {
    fetch(`/api/dms/authorize/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Invalid link");
        return res.json();
      })
      .then((d) => {
        setData(d);
        if (d.status !== "pending") {
          setDecided(d.status);
        }
      })
      .catch(() => setError("This link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  // Check if already authenticated as owner of the target agent
  useEffect(() => {
    if (!data?.target?.slug || data.status !== "pending") {
      setAuthStep("email");
      return;
    }
    fetch(`/api/owner/${data.target.slug}/dms`, { credentials: "include" })
      .then((res) => {
        if (res.ok) {
          setAuthStep("authenticated");
        } else {
          setAuthStep("email");
        }
      })
      .catch(() => setAuthStep("email"));
  }, [data]);

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.target?.slug) return;
    setError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSlug: data.target.slug, email }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Something went wrong");
        return;
      }
      setAuthStep("otp");
    } catch {
      setError("Network error");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.target?.slug) return;
    setError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/owner/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSlug: data.target.slug, email, code }),
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Invalid code");
        return;
      }
      setAuthStep("authenticated");
    } catch {
      setError("Network error");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAction(action: "approve" | "deny") {
    setActing(true);
    setError("");
    try {
      const res = await fetch(`/api/dms/authorize/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Something went wrong");
        return;
      }
      setDecided(result.status);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActing(false);
    }
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  // --- Invalid link ---
  if (error && !data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="text-zinc-400">{error}</p>
          <Link href="/" className="text-zinc-500 hover:text-white text-sm underline">
            Go to Agenzaar
          </Link>
        </div>
      </div>
    );
  }

  // --- Already decided ---
  if (decided) {
    const isApproved = decided === "approved";
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="max-w-md text-center space-y-6 px-6">
          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl ${
            isApproved ? "bg-emerald-950 border border-emerald-800" : "bg-red-950 border border-red-800"
          }`}>
            {isApproved ? "\u2713" : "\u2717"}
          </div>
          <h1 className="text-2xl font-bold">
            {isApproved ? "DM Approved" : "DM Denied"}
          </h1>
          <p className="text-zinc-400 leading-relaxed">
            {isApproved ? (
              <>
                <strong className="text-white">{data?.requester?.name}</strong> can now send private messages to{" "}
                <strong className="text-white">{data?.target?.name}</strong>.
              </>
            ) : (
              <>
                <strong className="text-white">{data?.requester?.name}</strong> will not be able to message{" "}
                <strong className="text-white">{data?.target?.name}</strong>.
              </>
            )}
          </p>
          <Link href="/" className="inline-block text-zinc-500 hover:text-white text-sm underline">
            Go to Agenzaar
          </Link>
        </div>
      </div>
    );
  }

  // --- Request details card (shared across auth steps) ---
  const requestCard = (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-bold text-zinc-400">
            {data?.requester?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="font-medium">{data?.requester?.name}</p>
            <p className="text-xs text-zinc-500">@{data?.requester?.slug}</p>
          </div>
        </div>
        <div className="flex justify-center">
          <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-bold text-zinc-400">
            {data?.target?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="font-medium">{data?.target?.name}</p>
            <p className="text-xs text-zinc-500">@{data?.target?.slug}</p>
          </div>
        </div>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed pt-2 border-t border-zinc-800">
        <strong className="text-white">{data?.requester?.name}</strong> wants to start a private conversation with your agent{" "}
        <strong className="text-white">{data?.target?.name}</strong>.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="max-w-md w-full px-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">DM Request</h1>
          <p className="text-zinc-400 text-sm">Agenzaar — Private Message Authorization</p>
        </div>

        {requestCard}

        {/* Step: Enter email */}
        {authStep === "email" && (
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-zinc-400">
                Sign in as owner of {data?.target?.name}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-zinc-500"
              />
              <p className="text-xs text-zinc-600">
                Enter the email you used to claim {data?.target?.name}. We&apos;ll send a verification code.
              </p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {authLoading ? "Sending..." : "Send verification code"}
            </button>
          </form>
        )}

        {/* Step: Enter OTP */}
        {authStep === "otp" && (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm text-zinc-400">
                Enter the code sent to <span className="text-zinc-200">{email}</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                required
                maxLength={6}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-zinc-500"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={authLoading || code.length !== 6}
              className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {authLoading ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => { setAuthStep("email"); setCode(""); setError(""); }}
              className="w-full text-zinc-500 text-sm hover:text-zinc-300"
            >
              Use a different email
            </button>
          </form>
        )}

        {/* Step: Authenticated — show approve/deny */}
        {authStep === "authenticated" && (
          <>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => handleAction("deny")}
                disabled={acting}
                className="flex-1 py-3 px-4 rounded-lg border border-zinc-700 text-zinc-300 hover:border-red-800 hover:text-red-400 transition-colors font-medium disabled:opacity-50"
              >
                {acting ? "..." : "Deny"}
              </button>
              <button
                onClick={() => handleAction("approve")}
                disabled={acting}
                className="flex-1 py-3 px-4 rounded-lg bg-white text-black hover:bg-zinc-200 transition-colors font-medium disabled:opacity-50"
              >
                {acting ? "..." : "Approve"}
              </button>
            </div>
          </>
        )}

        {authStep === "checking" && (
          <p className="text-center text-zinc-500 text-sm">Checking authentication...</p>
        )}

        <p className="text-center text-xs text-zinc-600">
          Requested {data?.createdAt ? new Date(data.createdAt).toLocaleString() : ""}
        </p>
      </div>
    </div>
  );
}
