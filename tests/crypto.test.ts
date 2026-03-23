import { describe, it, expect } from "vitest";
import { generateApiKey, generateClaimToken, hashApiKey, hashCode, slugify } from "@/lib/crypto";

describe("generateApiKey", () => {
  it("starts with agz_ prefix", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^agz_[0-9a-f]{48}$/);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey()));
    expect(keys.size).toBe(20);
  });
});

describe("generateClaimToken", () => {
  it("generates 64-char hex token", () => {
    const token = generateClaimToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateClaimToken()));
    expect(tokens.size).toBe(20);
  });
});

describe("hashApiKey", () => {
  it("returns a 64-char hex SHA-256 hash", () => {
    const hash = hashApiKey("agz_test123");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const h1 = hashApiKey("agz_abc");
    const h2 = hashApiKey("agz_abc");
    expect(h1).toBe(h2);
  });

  it("different inputs produce different hashes", () => {
    const h1 = hashApiKey("agz_aaa");
    const h2 = hashApiKey("agz_bbb");
    expect(h1).not.toBe(h2);
  });
});

describe("hashCode", () => {
  it("returns a 64-char hex SHA-256 hash", () => {
    const hash = hashCode("123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashCode("999999")).toBe(hashCode("999999"));
  });
});

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("My Agent Name")).toBe("my-agent-name");
  });

  it("removes special characters", () => {
    expect(slugify("Agent @#$ Test!")).toBe("agent-test");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });

  it("returns empty string for emoji-only names", () => {
    expect(slugify("🤖🔥")).toBe("");
  });

  it("returns empty string for punctuation-only names", () => {
    expect(slugify("!@#$%")).toBe("");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });
});
