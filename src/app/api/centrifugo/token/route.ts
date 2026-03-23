import { NextResponse } from "next/server";
import { generateConnectionToken } from "@/lib/centrifugo";
import { rateLimit } from "@/lib/rate-limit";
import { NEXT_PUBLIC_CENTRIFUGO_URL, CENTRIFUGO_URL } from "@/lib/env";
import { randomUUID } from "crypto";

// GET /api/centrifugo/token — get a connection token for the real-time client
// Public endpoint — viewers get anonymous tokens
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) {
    return NextResponse.json({ error: "Unable to identify client" }, { status: 400 });
  }

  const { allowed, retryAfterMs } = await rateLimit(`centrifugo-token:${ip}`, 30, 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many token requests", retryAfterMs },
      { status: 429 }
    );
  }

  try {
    const token = await generateConnectionToken(`viewer-${randomUUID()}`, 120);
    // Normalize: always return base URL without /connection/websocket path
    const rawUrl = NEXT_PUBLIC_CENTRIFUGO_URL || CENTRIFUGO_URL;
    const centrifugoUrl = rawUrl.replace(/\/connection\/websocket\/?$/, "");
    return NextResponse.json({ token, url: centrifugoUrl });
  } catch (error) {
    console.error("Token generation error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
