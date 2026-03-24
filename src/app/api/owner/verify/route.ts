import { db } from "@/db";
import { agents, ownerSessions } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createOwnerToken } from "@/lib/owner-auth";
import { hashCode } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { ownerVerifySchema, parseBody } from "@/lib/schemas";
import { IS_PROD } from "@/lib/env";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = parseBody(ownerVerifySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { agentSlug, email: emailLower, code } = parsed.data;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

    // Rate limit: 5 verify attempts per email per 15 min
    const rlEmail = await rateLimit(`owner-verify:${emailLower}`, 5, 15 * 60 * 1000);
    if (!rlEmail.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later.", retryAfterMs: rlEmail.retryAfterMs },
        { status: 429 }
      );
    }

    // Rate limit: 15 verify attempts per IP per 15 min (anti-DoS)
    if (ip) {
      const rlIp = await rateLimit(`owner-verify-ip:${ip}`, 15, 15 * 60 * 1000);
      if (!rlIp.allowed) {
        return NextResponse.json(
          { error: "Too many attempts. Try again later.", retryAfterMs: rlIp.retryAfterMs },
          { status: 429 }
        );
      }
    }

    // Find agent
    const [agent] = await db
      .select({ id: agents.id, name: agents.name, slug: agents.slug, ownerEmail: agents.ownerEmail })
      .from(agents)
      .where(eq(agents.slug, agentSlug))
      .limit(1);

    // Unified error for all verify failures — don't reveal agent/email state
    if (!agent || !agent.ownerEmail || agent.ownerEmail.toLowerCase() !== emailLower) {
      return NextResponse.json({ error: "Invalid or expired code. Please try again." }, { status: 401 });
    }

    // Find valid OTP session (pending status, not expired)
    const [session] = await db
      .select()
      .from(ownerSessions)
      .where(
        and(
          eq(ownerSessions.agentId, agent.id),
          eq(ownerSessions.email, emailLower),
          eq(ownerSessions.otpCode, hashCode(code)),
          eq(ownerSessions.otpStatus, "pending"),
          gt(ownerSessions.otpExpiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: "Invalid or expired code. Please try again." }, { status: 401 });
    }

    // Mark session as used
    await db
      .update(ownerSessions)
      .set({ verified: true, otpStatus: "used" })
      .where(eq(ownerSessions.id, session.id));

    // Create JWT
    const token = createOwnerToken(agent.id, emailLower);

    const response = NextResponse.json({
      ok: true,
      agent: { id: agent.id, name: agent.name, slug: agent.slug },
    });

    // Set cookie — 24h, httpOnly, secure
    response.headers.set(
      "Set-Cookie",
      `owner_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${IS_PROD ? "; Secure" : ""}`
    );

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
