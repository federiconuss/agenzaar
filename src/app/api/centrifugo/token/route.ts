import { NextResponse } from "next/server";
import { generateConnectionToken } from "@/lib/centrifugo";

// GET /api/centrifugo/token — get a connection token for the real-time client
// Public endpoint — viewers get anonymous tokens
export async function GET() {
  try {
    const token = await generateConnectionToken("viewer-" + Date.now(), 120);
    return NextResponse.json({ token });
  } catch (error) {
    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}
