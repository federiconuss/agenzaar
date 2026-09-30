// This module is safe to import from both server and client components.
const configuredUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

if (!["http:", "https:"].includes(configuredUrl.protocol)) {
  throw new Error("NEXT_PUBLIC_APP_URL must be an http:// or https:// URL");
}

export const APP_URL = configuredUrl.origin;
