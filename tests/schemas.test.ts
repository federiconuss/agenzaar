import { describe, it, expect } from "vitest";
import {
  registerAgentSchema,
  postMessageSchema,
  sendDMSchema,
  ownerLoginSchema,
  ownerVerifySchema,
  adminAgentActionSchema,
  dmAuthActionSchema,
  claimVerifySchema,
  claimConfirmSchema,
  parseBody,
} from "@/lib/schemas";

describe("registerAgentSchema", () => {
  it("accepts valid input", () => {
    const result = registerAgentSchema.safeParse({
      name: "My Agent",
      framework: "langchain",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Agent");
      expect(result.data.capabilities).toEqual([]);
    }
  });

  it("trims name", () => {
    const result = registerAgentSchema.safeParse({
      name: "  Spaced  ",
      framework: "custom",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Spaced");
  });

  it("rejects name shorter than 2 chars", () => {
    const result = registerAgentSchema.safeParse({ name: "A", framework: "custom" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 100 chars", () => {
    const result = registerAgentSchema.safeParse({
      name: "a".repeat(101),
      framework: "custom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid framework", () => {
    const result = registerAgentSchema.safeParse({
      name: "Test",
      framework: "not-a-framework",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all known frameworks", () => {
    const frameworks = [
      "langchain", "openai-agents", "claude-sdk", "crewai", "autogen",
      "google-adk", "openclaw", "hermes", "strands", "pydantic-ai",
      "smolagents", "autogpt", "llamaindex", "mastra", "elizaos", "custom",
    ];
    for (const fw of frameworks) {
      const result = registerAgentSchema.safeParse({ name: "Test", framework: fw });
      expect(result.success).toBe(true);
    }
  });

  it("caps capabilities at 20 items and 50 chars", () => {
    const caps = Array.from({ length: 25 }, (_, i) => "c".repeat(60) + i);
    const result = registerAgentSchema.safeParse({
      name: "Test",
      framework: "custom",
      capabilities: caps,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capabilities.length).toBeLessThanOrEqual(20);
      for (const c of result.data.capabilities) {
        expect(c.length).toBeLessThanOrEqual(50);
      }
    }
  });

  it("defaults capabilities to empty array when missing", () => {
    const result = registerAgentSchema.safeParse({ name: "Test", framework: "custom" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.capabilities).toEqual([]);
  });
});

describe("postMessageSchema", () => {
  it("accepts valid message", () => {
    const result = postMessageSchema.safeParse({ content: "Hello world" });
    expect(result.success).toBe(true);
  });

  it("trims content", () => {
    const result = postMessageSchema.safeParse({ content: "  hello  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.content).toBe("hello");
  });

  it("rejects empty content", () => {
    const result = postMessageSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only content", () => {
    const result = postMessageSchema.safeParse({ content: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects content over 500 chars", () => {
    const result = postMessageSchema.safeParse({ content: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts optional reply_to UUID", () => {
    const result = postMessageSchema.safeParse({
      content: "Hi",
      reply_to: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid reply_to UUID", () => {
    const result = postMessageSchema.safeParse({
      content: "Hi",
      reply_to: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("sendDMSchema", () => {
  it("accepts valid DM", () => {
    const result = sendDMSchema.safeParse({ to: "jarvis", content: "Hello" });
    expect(result.success).toBe(true);
  });

  it("trims content", () => {
    const result = sendDMSchema.safeParse({ to: "jarvis", content: "  Hi  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.content).toBe("Hi");
  });

  it("rejects missing to", () => {
    const result = sendDMSchema.safeParse({ content: "Hello" });
    expect(result.success).toBe(false);
  });

  it("rejects content over 500 chars", () => {
    const result = sendDMSchema.safeParse({ to: "jarvis", content: "a".repeat(501) });
    expect(result.success).toBe(false);
  });
});

describe("ownerLoginSchema", () => {
  it("accepts valid email and slug", () => {
    const result = ownerLoginSchema.safeParse({ agentSlug: "my-agent", email: "Owner@Test.com" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("owner@test.com");
  });

  it("rejects invalid email", () => {
    const result = ownerLoginSchema.safeParse({ agentSlug: "my-agent", email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("ownerVerifySchema", () => {
  it("accepts valid input", () => {
    const result = ownerVerifySchema.safeParse({
      agentSlug: "test",
      email: "a@b.com",
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects code that is not 6 chars", () => {
    const r1 = ownerVerifySchema.safeParse({ agentSlug: "test", email: "a@b.com", code: "123" });
    expect(r1.success).toBe(false);
    const r2 = ownerVerifySchema.safeParse({ agentSlug: "test", email: "a@b.com", code: "1234567" });
    expect(r2.success).toBe(false);
  });
});

describe("adminAgentActionSchema", () => {
  it("accepts valid action", () => {
    const result = adminAgentActionSchema.safeParse({
      agentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      action: "ban",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = adminAgentActionSchema.safeParse({
      agentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      action: "delete",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID", () => {
    const result = adminAgentActionSchema.safeParse({
      agentId: "not-a-uuid",
      action: "ban",
    });
    expect(result.success).toBe(false);
  });
});

describe("dmAuthActionSchema", () => {
  it("accepts approve", () => {
    expect(dmAuthActionSchema.safeParse({ action: "approve" }).success).toBe(true);
  });

  it("accepts deny", () => {
    expect(dmAuthActionSchema.safeParse({ action: "deny" }).success).toBe(true);
  });

  it("rejects other actions", () => {
    expect(dmAuthActionSchema.safeParse({ action: "block" }).success).toBe(false);
  });
});

describe("claimVerifySchema", () => {
  it("normalizes email", () => {
    const result = claimVerifySchema.safeParse({ email: " Test@EMAIL.com " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("test@email.com");
  });
});

describe("claimConfirmSchema", () => {
  it("accepts 6-digit code", () => {
    expect(claimConfirmSchema.safeParse({ code: "123456" }).success).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(claimConfirmSchema.safeParse({ code: "12345" }).success).toBe(false);
  });
});

describe("parseBody helper", () => {
  it("returns data on success", () => {
    const result = parseBody(sendDMSchema, { to: "test", content: "hi" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeDefined();
  });

  it("returns error on failure", () => {
    const result = parseBody(sendDMSchema, { content: "hi" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBeDefined();
  });

  it("returns first error message", () => {
    const result = parseBody(registerAgentSchema, {});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
