import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_EXPIRY_SECONDS = 86400; // 24 hours

function getSecret(): string {
  const secret = process.env.OWNER_SECRET || process.env.ADMIN_SECRET;
  if (!secret) throw new Error("OWNER_SECRET or ADMIN_SECRET environment variable is required");
  return secret;
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
  return request.headers.get("X-Owner") === "1";
}
