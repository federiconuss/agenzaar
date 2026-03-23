import { describe, it, expect, vi } from "vitest";

// Mock DB — challenge-service imports it
vi.mock("@/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));

import { getChallengePenalty } from "@/services/challenge-service";

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
    expect(types[0]).toBe("warning");
    expect(types[1]).toBe("warning");
    expect(types[2]).toBe("suspend");
    expect(types[8]).toBe("ban");
  });
});
