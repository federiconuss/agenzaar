import { describe, it, expect } from "vitest";
import { createOwnerToken, verifyOwnerToken, getOwnerSession, requireOwnerCSRF } from "@/lib/owner-auth";

describe("createOwnerToken / verifyOwnerToken", () => {
  const agentId = "aaaaaaaa-1111-2222-3333-444444444444";
  const email = "owner@example.com";

  it("creates a token that verifies successfully", () => {
    const token = createOwnerToken(agentId, email);
    const session = verifyOwnerToken(token);
    expect(session).not.toBeNull();
    expect(session!.agentId).toBe(agentId);
    expect(session!.email).toBe(email);
  });

  it("rejects tampered tokens", () => {
    const token = createOwnerToken(agentId, email);
    const tampered = token.slice(0, -2) + "xx";
    expect(verifyOwnerToken(tampered)).toBeNull();
  });

  it("rejects empty/malformed tokens", () => {
    expect(verifyOwnerToken("")).toBeNull();
    expect(verifyOwnerToken("notvalid")).toBeNull();
    expect(verifyOwnerToken("a.b.c")).toBeNull();
  });

  it("token payload has correct fields", () => {
    const token = createOwnerToken(agentId, email);
    const [payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    expect(payload.sub).toBe("owner");
    expect(payload.agentId).toBe(agentId);
    expect(payload.email).toBe(email);
    expect(payload.exp - payload.iat).toBe(86400);
  });
});

describe("getOwnerSession", () => {
  const agentId = "aaaaaaaa-1111-2222-3333-444444444444";
  const email = "owner@example.com";

  it("returns null without cookie", () => {
    const req = new Request("http://localhost");
    expect(getOwnerSession(req)).toBeNull();
  });

  it("extracts session from valid cookie", () => {
    const token = createOwnerToken(agentId, email);
    const req = new Request("http://localhost", {
      headers: { cookie: `owner_session=${token}` },
    });
    const session = getOwnerSession(req);
    expect(session).not.toBeNull();
    expect(session!.agentId).toBe(agentId);
  });

  it("returns null for invalid cookie value", () => {
    const req = new Request("http://localhost", {
      headers: { cookie: "owner_session=garbage.token" },
    });
    expect(getOwnerSession(req)).toBeNull();
  });

  it("handles multiple cookies correctly", () => {
    const token = createOwnerToken(agentId, email);
    const req = new Request("http://localhost", {
      headers: { cookie: `other=value; owner_session=${token}; another=thing` },
    });
    const session = getOwnerSession(req);
    expect(session).not.toBeNull();
  });
});

describe("requireOwnerCSRF", () => {
  function makeRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/owner/test", { method: "POST", headers });
  }

  it("rejects without X-Owner header", () => {
    expect(requireOwnerCSRF(makeRequest({ origin: "https://agenzaar.com" }))).toBe(false);
  });

  it("rejects without Origin (fail-closed)", () => {
    expect(requireOwnerCSRF(makeRequest({ "X-Owner": "1" }))).toBe(false);
  });

  it("accepts valid Origin + X-Owner", () => {
    expect(requireOwnerCSRF(makeRequest({
      "X-Owner": "1",
      origin: "https://agenzaar.com",
    }))).toBe(true);
  });

  it("rejects arbitrary origins", () => {
    expect(requireOwnerCSRF(makeRequest({
      "X-Owner": "1",
      origin: "https://evil.com",
    }))).toBe(false);
  });

  it("rejects non-agenzaar vercel.app", () => {
    expect(requireOwnerCSRF(makeRequest({
      "X-Owner": "1",
      origin: "https://evil.vercel.app",
    }))).toBe(false);
  });

  it("accepts agenzaar vercel.app previews", () => {
    expect(requireOwnerCSRF(makeRequest({
      "X-Owner": "1",
      origin: "https://preview-123.agenzaar.vercel.app",
    }))).toBe(true);
  });
});
