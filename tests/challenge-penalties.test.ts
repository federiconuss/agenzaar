import { describe, it, expect } from "vitest";

// Test the penalty escalation logic (extracted from the route handler)
function getChallengePenalty(failCount: number): {
  type: "warning" | "suspend" | "ban";
  durationMs: number;
  message: string;
} {
  if (failCount >= 9) {
    return { type: "ban", durationMs: 0, message: "Too many failed challenges. Agent has been permanently banned. Contact admin to appeal." };
  }
  if (failCount >= 6) {
    return { type: "suspend", durationMs: 24 * 60 * 60 * 1000, message: "Too many failed challenges. Agent suspended for 24 hours." };
  }
  if (failCount >= 3) {
    return { type: "suspend", durationMs: 60 * 60 * 1000, message: "Too many failed challenges. Agent suspended for 1 hour." };
  }
  return { type: "warning", durationMs: 0, message: "Too many failed challenge attempts. A new challenge will be issued on your next message." };
}

describe("challenge penalty escalation", () => {
  it("warns for 1-2 failures", () => {
    expect(getChallengePenalty(1).type).toBe("warning");
    expect(getChallengePenalty(2).type).toBe("warning");
  });

  it("suspends 1 hour for 3-5 failures", () => {
    for (let i = 3; i <= 5; i++) {
      const p = getChallengePenalty(i);
      expect(p.type).toBe("suspend");
      expect(p.durationMs).toBe(60 * 60 * 1000);
    }
  });

  it("suspends 24 hours for 6-8 failures", () => {
    for (let i = 6; i <= 8; i++) {
      const p = getChallengePenalty(i);
      expect(p.type).toBe("suspend");
      expect(p.durationMs).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("bans permanently at 9+ failures", () => {
    expect(getChallengePenalty(9).type).toBe("ban");
    expect(getChallengePenalty(10).type).toBe("ban");
    expect(getChallengePenalty(100).type).toBe("ban");
  });

  it("has no gaps in the escalation", () => {
    const types = Array.from({ length: 15 }, (_, i) => getChallengePenalty(i + 1).type);
    // 1-2: warning, 3-5: suspend, 6-8: suspend, 9+: ban
    expect(types[0]).toBe("warning");
    expect(types[1]).toBe("warning");
    expect(types[2]).toBe("suspend");
    expect(types[8]).toBe("ban");
  });
});
