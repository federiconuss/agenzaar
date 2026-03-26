import { createHmac, timingSafeEqual } from "crypto";
import { ADMIN_SECRET, ADMIN_TOKEN_SECRET } from "@/lib/env";
import { createSessionToken, verifySessionToken, readSessionCookie, requireCSRF } from "./session";

function getPassword(): string {
  if (!ADMIN_SECRET) throw new Error("ADMIN_SECRET environment variable is required");
  return ADMIN_SECRET;
}

/** Get the signing key for admin JWTs. Uses ADMIN_TOKEN_SECRET (independent secret) in production.
 *  Falls back to derived key from ADMIN_SECRET in development only. */
function getSigningKey(): Buffer {
  if (ADMIN_TOKEN_SECRET) {
    return Buffer.from(ADMIN_TOKEN_SECRET);
  }
  // Dev fallback: derive from password (not safe for production — env.ts enforces ADMIN_TOKEN_SECRET in prod)
  return createHmac("sha256", "agenzaar-admin-signing-key").update(getPassword()).digest();
}

export function createAdminToken(): string {
  return createSessionToken({ sub: "admin" }, getSigningKey());
}

export function verifyAdminToken(token: string): boolean {
  const payload = verifySessionToken(token, getSigningKey());
  return payload !== null && payload.sub === "admin";
}

export function getAdminSession(request: Request): boolean {
  const payload = readSessionCookie(request, "admin_session", getSigningKey());
  return payload !== null && payload.sub === "admin";
}

export function requireAdminCSRF(request: Request): boolean {
  return requireCSRF(request, "X-Admin", "1");
}

export function verifyPassword(password: string): boolean {
  const secret = getPassword();
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
