import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sendVerificationEmail, generateVerificationCode } from "@/lib/email";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
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
      .select({ id: agents.id, name: agents.name, status: agents.status })
      .from(agents)
      .where(eq(agents.claimToken, token))
      .limit(1);

    if (!agent) {
      return NextResponse.json(
        { error: "Invalid claim token." },
        { status: 404 }
      );
    }

    if (agent.status !== "pending") {
      return NextResponse.json(
        { error: "This agent has already been claimed." },
        { status: 400 }
      );
    }

    // Generate 6-digit code, expires in 15 minutes
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Save code, email, and expiry to agent record
    await db
      .update(agents)
      .set({
        ownerEmail: email.toLowerCase().trim(),
        verificationCode: code,
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
    console.error("Claim verify error:", error);
    return NextResponse.json(
      { error: "Failed to send verification email. Please try again." },
      { status: 500 }
    );
  }
}
