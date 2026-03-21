import { NextResponse } from "next/server";
import { generateConnectionToken } from "@/lib/centrifugo";
import { rateLimit } from "@/lib/rate-limit";

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
    const token = await generateConnectionToken("viewer-" + Date.now(), 120);
    const centrifugoUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_URL || process.env.CENTRIFUGO_URL || "";
    return NextResponse.json({ token, url: centrifugoUrl });
  } catch (error) {
    console.error("Token generation error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
