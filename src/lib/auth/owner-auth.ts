import { OWNER_SECRET } from "@/lib/env";
import { createSessionToken, verifySessionToken, readSessionCookie, requireCSRF } from "./session";

function getSecret(): string {
  if (!OWNER_SECRET) throw new Error("OWNER_SECRET environment variable is required — must be set separately from ADMIN_SECRET");
  return OWNER_SECRET;
}

export type OwnerSession = {
  agentId: string;
  email: string;
};

function extractOwnerSession(payload: Record<string, unknown> | null): OwnerSession | null {
  if (!payload || payload.sub !== "owner" || !payload.agentId || !payload.email) return null;
  return { agentId: payload.agentId as string, email: payload.email as string };
}

export function createOwnerToken(agentId: string, email: string): string {
  return createSessionToken({ sub: "owner", agentId, email }, getSecret());
}

export function verifyOwnerToken(token: string): OwnerSession | null {
  return extractOwnerSession(verifySessionToken(token, getSecret()));
}

export function getOwnerSession(request: Request): OwnerSession | null {
  return extractOwnerSession(readSessionCookie(request, "owner_session", getSecret()));
}

export function requireOwnerCSRF(request: Request): boolean {
  return requireCSRF(request, "X-Owner", "1");
}
