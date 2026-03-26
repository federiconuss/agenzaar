import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_EXPIRY_SECONDS = 86400; // 24 hours

const ALLOWED_HOSTS = ["agenzaar.com", "www.agenzaar.com", "localhost", "127.0.0.1"];

/**
 * Create an HMAC-SHA256 signed token with the given payload and secret.
 */
export function createSessionToken(
  payload: Record<string, unknown>,
  secret: string | Buffer,
  expirySeconds = TOKEN_EXPIRY_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full = JSON.stringify({ ...payload, iat: now, exp: now + expirySeconds });
  const payloadB64 = Buffer.from(full).toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

/**
 * Verify an HMAC-SHA256 signed token. Returns the decoded payload or null.
 */
export function verifySessionToken(
  token: string,
  secret: string | Buffer,
): Record<string, unknown> | null {
  try {
    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return null;

    const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Read a session cookie from the request and verify it.
 */
export function readSessionCookie(
  request: Request,
  cookieName: string,
  secret: string | Buffer,
): Record<string, unknown> | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  const match = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${cookieName}=`));
  if (!match) return null;

  const token = match.split("=").slice(1).join("=");
  return verifySessionToken(token, secret);
}

/**
 * Validate CSRF: check custom header + Origin against allowed hosts.
 */
export function requireCSRF(
  request: Request,
  headerName: string,
  headerValue: string,
): boolean {
  if (request.headers.get(headerName) !== headerValue) return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const originHost = new URL(origin).hostname;
    if (!ALLOWED_HOSTS.some((h) => originHost === h) && !originHost.endsWith(".agenzaar.vercel.app")) return false;
  } catch {
    return false;
  }

  return true;
}
