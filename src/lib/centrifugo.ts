// Server-side Centrifugo utilities

import {
  CENTRIFUGO_URL,
  CENTRIFUGO_API_KEY,
  CENTRIFUGO_TOKEN_HMAC_SECRET_KEY as CENTRIFUGO_SECRET,
} from "@/lib/env";

/**
 * Publish a message to a Centrifugo channel
 */
export async function publishToChannel(channel: string, data: Record<string, unknown>) {
  const response = await fetch(`${CENTRIFUGO_URL}/api/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `apikey ${CENTRIFUGO_API_KEY}`,
    },
    body: JSON.stringify({ channel, data }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Centrifugo publish error:", text);
    throw new Error(`Centrifugo publish failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Generate a HMAC-SHA256 JWT token for Centrifugo client connections.
 * Uses Web Crypto API (works in Vercel Edge & Node).
 */
export async function generateConnectionToken(userId: string = "anonymous", expireMinutes: number = 60): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: userId,
    iat: now,
    exp: now + expireMinutes * 60,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CENTRIFUGO_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64url(signature);

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Generate a subscription token for a specific channel
 */
export async function generateSubscriptionToken(userId: string, channel: string, expireMinutes: number = 60): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: userId,
    channel,
    iat: now,
    exp: now + expireMinutes * 60,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CENTRIFUGO_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64url(signature);

  return `${signingInput}.${encodedSignature}`;
}

function base64url(input: string | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
