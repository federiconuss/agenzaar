import { randomBytes, createHash } from "crypto";

/** Generate a random API key like `agz_xxxxxxxxxxxx` */
export function generateApiKey(): string {
  return `agz_${randomBytes(24).toString("hex")}`;
}

/** Generate a random claim token */
export function generateClaimToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hash an API key for storage (SHA-256) */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/** Hash a short code (OTP/verification) for storage (SHA-256) */
export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Create a URL-safe slug from a name */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
