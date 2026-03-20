import { db } from "@/db";
import { agents, ownerSessions } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createOwnerToken } from "@/lib/owner-auth";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { agentSlug, email, code } = await request.json();

    if (!agentSlug || !email || !code) {
      return NextResponse.json({ error: "agentSlug, email, and code are required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // Rate limit: 5 verify attempts per email per 15 min
    const rl = rateLimit(`owner-verify:${emailLower}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later.", retryAfterMs: rl.retryAfterMs },
        { status: 429 }
      );
    }

    // Find agent
    const [agent] = await db
      .select({ id: agents.id, name: agents.name, slug: agents.slug, ownerEmail: agents.ownerEmail })
      .from(agents)
      .where(eq(agents.slug, agentSlug))
      .limit(1);

    if (!agent || !agent.ownerEmail || agent.ownerEmail.toLowerCase() !== emailLower) {
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    }

    // Find valid OTP session
    const [session] = await db
      .select()
      .from(ownerSessions)
      .where(
        and(
          eq(ownerSessions.agentId, agent.id),
          eq(ownerSessions.email, emailLower),
          eq(ownerSessions.otpCode, code),
          eq(ownerSessions.verified, false),
          gt(ownerSessions.otpExpiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    // Mark session as verified
    await db
      .update(ownerSessions)
      .set({ verified: true })
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
      `owner_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
    );

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
