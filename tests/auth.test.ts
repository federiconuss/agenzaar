import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedAgent } from "@/lib/auth/agent-auth";

// Mock the database
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

const mockAgent: AuthenticatedAgent = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  name: "TestAgent",
  slug: "test-agent",
  status: "claimed",
  avatarUrl: null,
  failedChallenges: 0,
  suspendedUntil: null,
  forceChallenge: false,
};

function makeRequest(apiKey?: string): Request {
  const headers: Record<string, string> = {};
  if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
  return new Request("http://localhost/api/test", { headers });
}

describe("authenticateAgent", () => {
  let authenticateAgent: typeof import("@/lib/auth/agent-auth").authenticateAgent;
  let db: { select: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    const dbMod = await import("@/db");
    db = dbMod.db as unknown as { select: ReturnType<typeof vi.fn> };
    const authMod = await import("@/lib/auth/agent-auth");
    authenticateAgent = authMod.authenticateAgent;
  });

  it("returns null without Authorization header", async () => {
    const result = await authenticateAgent(makeRequest());
    expect(result).toBeNull();
  });

  it("returns null for non-Bearer auth", async () => {
    const req = new Request("http://localhost", {
      headers: { authorization: "Basic abc123" },
    });
    const result = await authenticateAgent(req);
    expect(result).toBeNull();
  });

  it("returns null for non-agz_ prefix key", async () => {
    const result = await authenticateAgent(makeRequest("sk_notanagzkey"));
    expect(result).toBeNull();
  });

  it("returns agent for valid API key", async () => {
    const mockChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockAgent]),
    };
    db.select.mockReturnValue(mockChain);

    const result = await authenticateAgent(makeRequest("agz_" + "a".repeat(48)));
    expect(result).toEqual(mockAgent);
  });

  it("returns null when agent not found in DB", async () => {
    const mockChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    db.select.mockReturnValue(mockChain);

    const result = await authenticateAgent(makeRequest("agz_" + "b".repeat(48)));
    expect(result).toBeNull();
  });
});

describe("requireActiveAgent", () => {
  let requireActiveAgent: typeof import("@/lib/auth/agent-auth").requireActiveAgent;
  let db: { select: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    const dbMod = await import("@/db");
    db = dbMod.db as unknown as { select: ReturnType<typeof vi.fn> };
    const authMod = await import("@/lib/auth/agent-auth");
    requireActiveAgent = authMod.requireActiveAgent;
  });

  function setupDbReturn(agent: AuthenticatedAgent | null) {
    const mockChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(agent ? [agent] : []),
    };
    db.select.mockReturnValue(mockChain);
  }

  it("returns 401 for missing auth", async () => {
    const result = await requireActiveAgent(makeRequest());
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 403 for pending agent", async () => {
    setupDbReturn({ ...mockAgent, status: "pending" });
    const result = await requireActiveAgent(makeRequest("agz_" + "a".repeat(48)));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    const body = await (result as Response).json();
    expect(body.error).toContain("not yet claimed");
  });

  it("returns 403 for banned agent", async () => {
    setupDbReturn({ ...mockAgent, status: "banned" });
    const result = await requireActiveAgent(makeRequest("agz_" + "a".repeat(48)));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    const body = await (result as Response).json();
    expect(body.error).toContain("banned");
  });

  it("returns 403 for suspended agent", async () => {
    const future = new Date(Date.now() + 3600000);
    setupDbReturn({ ...mockAgent, suspendedUntil: future });
    const result = await requireActiveAgent(makeRequest("agz_" + "a".repeat(48)));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    const body = await (result as Response).json();
    expect(body.error).toContain("suspended");
  });

  it("returns agent for claimed agent with no suspension", async () => {
    setupDbReturn(mockAgent);
    const result = await requireActiveAgent(makeRequest("agz_" + "a".repeat(48)));
    expect(result).not.toBeInstanceOf(Response);
    expect((result as AuthenticatedAgent).id).toBe(mockAgent.id);
  });

  it("allows verified agent", async () => {
    setupDbReturn({ ...mockAgent, status: "verified" });
    const result = await requireActiveAgent(makeRequest("agz_" + "a".repeat(48)));
    expect(result).not.toBeInstanceOf(Response);
    expect((result as AuthenticatedAgent).status).toBe("verified");
  });

  it("allows agent with expired suspension", async () => {
    const past = new Date(Date.now() - 1000);
    setupDbReturn({ ...mockAgent, suspendedUntil: past });
    const result = await requireActiveAgent(makeRequest("agz_" + "a".repeat(48)));
    expect(result).not.toBeInstanceOf(Response);
  });
});
