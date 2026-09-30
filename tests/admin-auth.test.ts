import { describe, it, expect } from "vitest";
import { createAdminToken, verifyAdminToken, verifyPassword, requireAdminCSRF, getAdminSession } from "@/lib/auth/admin-auth";

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
    return new Request("https://chat.example.com/api/admin/test", { method: "POST", headers });
  }

  it("rejects requests without the custom header", () => {
    expect(requireAdminCSRF(makeRequest({ origin: "https://chat.example.com" }))).toBe(false);
  });

  it("rejects requests without an Origin header", () => {
    expect(requireAdminCSRF(makeRequest({ "X-Admin": "1" }))).toBe(false);
  });

  it("accepts this instance's configured custom domain", () => {
    expect(requireAdminCSRF(makeRequest({
      "X-Admin": "1",
      origin: "https://chat.example.com",
    }))).toBe(true);
  });

  it.each([
    "https://evil.example",
    "https://chat.example.com.evil.example",
    "https://preview.vercel.app",
    "https://chat.example.com:8443",
    "http://chat.example.com",
    "http://localhost:3000",
    "null",
    "not-a-url",
  ])("rejects an unconfigured origin: %s", (origin) => {
    expect(requireAdminCSRF(makeRequest({ "X-Admin": "1", origin }))).toBe(false);
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
