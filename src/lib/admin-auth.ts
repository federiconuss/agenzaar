import { createHmac, timingSafeEqual } from "crypto";
import { ADMIN_SECRET } from "@/lib/env";

const TOKEN_EXPIRY_SECONDS = 86400; // 24 hours

function getSecret(): string {
  if (!ADMIN_SECRET) throw new Error("ADMIN_SECRET environment variable is required");
  return ADMIN_SECRET;
}

/** Derive a separate signing key from ADMIN_SECRET — never use the password directly as HMAC key */
function getSigningKey(): Buffer {
  return createHmac("sha256", "agenzaar-admin-signing-key").update(getSecret()).digest();
}

export function createAdminToken(): string {
  const payload = JSON.stringify({
    sub: "admin",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS,
  });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", getSigningKey()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyAdminToken(token: string): boolean {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return false;

    // Verify signature using derived key
    const expectedSig = createHmac("sha256", getSigningKey()).update(payloadB64).digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;

    // Check expiration
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    if (payload.sub !== "admin") return false;

    return true;
  } catch {
    return false;
  }
}

export function getAdminSession(request: Request): boolean {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;

  const match = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith("admin_session="));
  if (!match) return false;

  const token = match.split("=").slice(1).join("=");
  return verifyAdminToken(token);
}

export function requireAdminCSRF(request: Request): boolean {
  if (request.headers.get("X-Admin") !== "1") return false;

  // Verify Origin — fail closed when Origin is absent on POST/PATCH/DELETE
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

export function verifyPassword(password: string): boolean {
  const secret = getSecret();
  if (!secret || !password) return false;
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
