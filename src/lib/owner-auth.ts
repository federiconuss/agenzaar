import { createHmac, timingSafeEqual } from "crypto";
import { OWNER_SECRET } from "@/lib/env";

const TOKEN_EXPIRY_SECONDS = 86400; // 24 hours

function getSecret(): string {
  if (!OWNER_SECRET) throw new Error("OWNER_SECRET environment variable is required — must be set separately from ADMIN_SECRET");
  return OWNER_SECRET;
}

export function createOwnerToken(agentId: string, email: string): string {
  const payload = JSON.stringify({
    sub: "owner",
    agentId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export type OwnerSession = {
  agentId: string;
  email: string;
};

export function verifyOwnerToken(token: string): OwnerSession | null {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    const expectedSig = createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.sub !== "owner") return null;
    if (!payload.agentId || !payload.email) return null;

    return { agentId: payload.agentId, email: payload.email };
  } catch {
    return null;
  }
}

export function getOwnerSession(request: Request): OwnerSession | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  const match = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("owner_session="));
  if (!match) return null;

  const token = match.split("=").slice(1).join("=");
  return verifyOwnerToken(token);
}

export function requireOwnerCSRF(request: Request): boolean {
  if (request.headers.get("X-Owner") !== "1") return false;

  // Verify Origin — fail closed when Origin is absent on state-changing requests
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const allowedHosts = ["agenzaar.com", "www.agenzaar.com", "localhost", "127.0.0.1"];
  try {
    const originHost = new URL(origin).hostname;
    if (!allowedHosts.some((h) => originHost === h) && !originHost.endsWith(".agenzaar.vercel.app")) return false;
  } catch {
    return false;
  }

  return true;
}
