import { describe, it, expect, beforeAll } from "vitest";
import { createAdminToken, verifyAdminToken, verifyPassword, requireAdminCSRF, getAdminSession } from "@/lib/admin-auth";

beforeAll(() => {
  process.env.ADMIN_SECRET = "test-admin-secret-123";
});

describe("createAdminToken / verifyAdminToken", () => {
  it("creates a token that verifies successfully", () => {
    const token = createAdminToken();
    expect(verifyAdminToken(token)).toBe(true);
  });

  it("rejects tampered tokens", () => {
    const token = createAdminToken();
    const tampered = token.slice(0, -2) + "xx";
    expect(verifyAdminToken(tampered)).toBe(false);
  });

  it("rejects empty/malformed tokens", () => {
    expect(verifyAdminToken("")).toBe(false);
    expect(verifyAdminToken("notavalidtoken")).toBe(false);
    expect(verifyAdminToken("a.b.c")).toBe(false);
  });

  it("token contains admin subject", () => {
    const token = createAdminToken();
    const [payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    expect(payload.sub).toBe("admin");
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});

describe("verifyPassword", () => {
  it("accepts correct password", () => {
    expect(verifyPassword("test-admin-secret-123")).toBe(true);
  });

  it("rejects wrong password", () => {
    expect(verifyPassword("wrong-password")).toBe(false);
  });

  it("rejects empty password", () => {
    expect(verifyPassword("")).toBe(false);
  });
});

describe("requireAdminCSRF", () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/admin/test", { method: "POST", headers });
  }

  it("rejects without X-Admin header", () => {
    expect(requireAdminCSRF(makeRequest({ origin: "https://agenzaar.com" }))).toBe(false);
  });

  it("rejects without Origin header (fail-closed)", () => {
    expect(requireAdminCSRF(makeRequest({ "X-Admin": "1" }))).toBe(false);
  });

  it("accepts valid Origin + X-Admin", () => {
    expect(requireAdminCSRF(makeRequest({
      "X-Admin": "1",
      origin: "https://agenzaar.com",
    }))).toBe(true);
  });

  it("accepts localhost Origin", () => {
    expect(requireAdminCSRF(makeRequest({
      "X-Admin": "1",
      origin: "http://localhost:3000",
    }))).toBe(true);
  });

  it("accepts Vercel preview deploys under agenzaar subdomain", () => {
    expect(requireAdminCSRF(makeRequest({
      "X-Admin": "1",
      origin: "https://my-branch.agenzaar.vercel.app",
    }))).toBe(true);
  });

  it("rejects arbitrary vercel.app origins", () => {
    expect(requireAdminCSRF(makeRequest({
      "X-Admin": "1",
      origin: "https://evil.vercel.app",
    }))).toBe(false);
  });

  it("rejects malicious origins", () => {
    expect(requireAdminCSRF(makeRequest({
      "X-Admin": "1",
      origin: "https://evil.com",
    }))).toBe(false);
  });
});

describe("getAdminSession", () => {
  it("returns false without cookie", () => {
    const req = new Request("http://localhost");
    expect(getAdminSession(req)).toBe(false);
  });

  it("returns true with valid session cookie", () => {
    const token = createAdminToken();
    const req = new Request("http://localhost", {
      headers: { cookie: `admin_session=${token}` },
    });
    expect(getAdminSession(req)).toBe(true);
  });

  it("returns false with invalid session cookie", () => {
    const req = new Request("http://localhost", {
      headers: { cookie: "admin_session=invalid.token" },
    });
    expect(getAdminSession(req)).toBe(false);
  });
});
