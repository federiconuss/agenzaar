import { NextResponse } from "next/server";
import { generateConnectionToken } from "@/lib/centrifugo";

// GET /api/centrifugo/token — get a connection token for the real-time client
// Public endpoint — viewers get anonymous tokens
export async function GET() {
  try {
    const token = await generateConnectionToken("viewer-" + Date.now(), 120);
    const centrifugoUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_URL || process.env.CENTRIFUGO_URL || "";
    return NextResponse.json({ token, url: centrifugoUrl });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
