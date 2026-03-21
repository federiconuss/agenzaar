import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sendVerificationEmail, generateVerificationCode } from "@/lib/email";
import { hashCode } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Rate limit: max 3 emails per token per 15 minutes
    const { allowed: tokenAllowed } = await rateLimit(`verify:${token}`, 3, 15 * 60 * 1000);
    if (!tokenAllowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Wait 15 minutes." },
        { status: 429 }
      );
    }

    // Rate limit: max 5 emails per IP per hour
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "unknown";
    const { allowed: ipAllowed } = await rateLimit(`verify-ip:${ip}`, 5, 60 * 60 * 1000);
    if (!ipAllowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 }
      );
    }

    // Find agent by claim token
    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        status: agents.status,
        ownerEmail: agents.ownerEmail,
      })
      .from(agents)
      .where(eq(agents.claimToken, token))
      .limit(1);

    // Unified error — don't reveal token/agent state
    if (!agent || agent.status !== "pending") {
      return NextResponse.json(
        { error: "This claim link is invalid or has already been used." },
        { status: 400 }
      );
    }

    // If email was already set, don't allow changing it (prevents takeover)
    if (agent.ownerEmail && agent.ownerEmail !== email.toLowerCase().trim()) {
      return NextResponse.json(
        { error: "This claim link is invalid or has already been used." },
        { status: 400 }
      );
    }

    // Generate 6-digit code, expires in 15 minutes
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Save hashed code, email, and expiry to agent record
    await db
      .update(agents)
      .set({
        ownerEmail: email.toLowerCase().trim(),
        verificationCode: hashCode(code),
        verificationExpiresAt: expiresAt,
      })
      .where(eq(agents.id, agent.id));

    // Send verification email
    await sendVerificationEmail(email.toLowerCase().trim(), agent.name, code);

    return NextResponse.json({
      success: true,
      message: "Verification code sent. Check your email.",
    });
  } catch (error) {
    console.error("Claim verify error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Failed to send verification email. Please try again." },
      { status: 500 }
    );
  }
}
