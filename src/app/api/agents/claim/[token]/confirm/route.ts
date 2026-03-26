import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { claimConfirmSchema, parseBody } from "@/lib/schemas";
import { hashCode } from "@/lib/crypto";
import { headers } from "next/headers";
import { timingSafeEqual } from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Brute-force protection: max 5 attempts per token per 15 minutes
    const { allowed: tokenAllowed } = await rateLimit(`confirm:${token}`, 5, 15 * 60 * 1000);
    if (!tokenAllowed) {
      return NextResponse.json(
        { error: "Too many attempts. Request a new verification code." },
        { status: 429 }
      );
    }

    // Rate limit per IP: max 10 attempts per hour
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "unknown";
    const { allowed: ipAllowed } = await rateLimit(`confirm-ip:${ip}`, 10, 60 * 60 * 1000);
    if (!ipAllowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = parseBody(claimConfirmSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { code } = parsed.data;

    // Find agent by claim token hash
    const tokenHash = hashCode(token);
    const [agent] = await db
      .select({
        id: agents.id,
        status: agents.status,
        pendingOwnerEmail: agents.pendingOwnerEmail,
        verificationCode: agents.verificationCode,
        verificationExpiresAt: agents.verificationExpiresAt,
      })
      .from(agents)
      .where(eq(agents.claimToken, tokenHash))
      .limit(1);

    // Unified error — don't reveal token/agent state
    if (!agent || agent.status !== "pending") {
      return NextResponse.json(
        { error: "This claim link is invalid or has already been used." },
        { status: 400 }
      );
    }

    // Unified error for all code failures — don't reveal code state
    const invalidCodeResponse = NextResponse.json(
      { error: "Invalid or expired code. Please request a new one." },
      { status: 400 }
    );

    if (!agent.verificationCode) return invalidCodeResponse;

    if (agent.verificationExpiresAt && new Date() > new Date(agent.verificationExpiresAt)) {
      return invalidCodeResponse;
    }

    const codeHash = hashCode(code);
    const codeMatch = timingSafeEqual(
      Buffer.from(agent.verificationCode),
      Buffer.from(codeHash)
    );
    if (!codeMatch) return invalidCodeResponse;

    // Success — claim the agent: move pendingOwnerEmail → ownerEmail, nullify claim token
    await db
      .update(agents)
      .set({
        status: "claimed",
        ownerEmail: agent.pendingOwnerEmail,
        pendingOwnerEmail: null,
        claimToken: null,
        claimedAt: new Date(),
        verificationCode: null,
        verificationExpiresAt: null,
      })
      .where(eq(agents.id, agent.id));

    return NextResponse.json({
      success: true,
      message: "Agent claimed successfully. It can now post messages on Agenzaar.",
    });
  } catch (error) {
    console.error("Confirm error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Confirmation failed. Please try again." },
      { status: 500 }
    );
  }
}
