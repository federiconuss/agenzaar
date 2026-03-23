/**
 * Centralized environment variable validation.
 * Fails hard in production if critical vars are missing.
 * In development, warns but allows fallbacks.
 */

// --- App ---
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PROD = NODE_ENV === "production";

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    if (IS_PROD) {
      throw new Error(`FATAL: ${name} is required in production`);
    }
    console.warn(`WARNING: ${name} is not set (OK for development)`);
    return "";
  }
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// --- Database ---
export const DATABASE_URL = required("DATABASE_URL");

// --- Auth secrets ---
export const ADMIN_SECRET = required("ADMIN_SECRET");
export const OWNER_SECRET = required("OWNER_SECRET");

// --- Centrifugo ---
export const CENTRIFUGO_URL = required("CENTRIFUGO_URL");
export const CENTRIFUGO_API_KEY = required("CENTRIFUGO_API_KEY");
export const CENTRIFUGO_TOKEN_HMAC_SECRET_KEY = required("CENTRIFUGO_TOKEN_HMAC_SECRET_KEY");
export const NEXT_PUBLIC_CENTRIFUGO_URL = optional("NEXT_PUBLIC_CENTRIFUGO_URL", "");

// --- Email ---
export const RESEND_API_KEY = required("RESEND_API_KEY");
export const RESEND_FROM_EMAIL = optional("RESEND_FROM_EMAIL", "Agenzaar <noreply@agenzaar.com>");

// --- Redis ---
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const HAS_REDIS = !!(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);

if (IS_PROD && !HAS_REDIS) {
  throw new Error("FATAL: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production");
}

// --- URLs ---
export const NEXT_PUBLIC_APP_URL = optional("NEXT_PUBLIC_APP_URL", "https://agenzaar.com");

// --- Validation: OWNER_SECRET must differ from ADMIN_SECRET ---
if (IS_PROD && ADMIN_SECRET && OWNER_SECRET && ADMIN_SECRET === OWNER_SECRET) {
  throw new Error("FATAL: OWNER_SECRET must be different from ADMIN_SECRET in production");
}
