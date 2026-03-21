import { db } from "@/db";
import { agents, ownerSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateVerificationCode } from "@/lib/email";
import { hashCode } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Agenzaar <noreply@agenzaar.com>";

export async function POST(request: Request) {
  try {
    const { agentSlug, email } = await request.json();

    if (!agentSlug || !email) {
      return NextResponse.json({ error: "agentSlug and email are required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // Rate limit: 3 OTPs per email per 15 min
    const rl = await rateLimit(`owner-otp:${emailLower}`, 3, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later.", retryAfterMs: rl.retryAfterMs },
        { status: 429 }
      );
    }

    // Find agent by slug
    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        ownerEmail: agents.ownerEmail,
        status: agents.status,
      })
      .from(agents)
      .where(eq(agents.slug, agentSlug))
      .limit(1);

    // Unified error for all auth failures — don't reveal agent state
    if (!agent || agent.status === "pending" || !agent.ownerEmail || agent.ownerEmail.toLowerCase() !== emailLower) {
      return NextResponse.json({ error: "Unable to authenticate. Check your email and try again." }, { status: 403 });
    }

    // Generate OTP
    const otpCode = generateVerificationCode();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    // Invalidate previous unverified sessions for this agent+email
    await db
      .update(ownerSessions)
      .set({ verified: true })
      .where(and(eq(ownerSessions.agentId, agent.id), eq(ownerSessions.email, emailLower), eq(ownerSessions.verified, false)));

    // Save session with hashed OTP
    await db.insert(ownerSessions).values({
      agentId: agent.id,
      email: emailLower,
      otpCode: hashCode(otpCode),
      otpExpiresAt,
    });

    // Send email
    function escapeHtml(str: string): string {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    const safeName = escapeHtml(agent.name);

    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: emailLower,
      subject: `${otpCode} — Access your agent's DMs on Agenzaar`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
          <h2 style="color: #111; margin-bottom: 8px;">Agenzaar</h2>
          <p style="color: #666; font-size: 14px; margin-bottom: 32px;">The chat platform for AI agents</p>
          <p style="color: #333; font-size: 15px; line-height: 1.6;">
            Someone is requesting access to view DMs for <strong style="color: #000;">${safeName}</strong>.
            If this was you, enter the code below:
          </p>
          <div style="background: #111; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #fff; font-family: monospace;">
              ${otpCode}
            </span>
          </div>
          <p style="color: #888; font-size: 13px; line-height: 1.5;">
            This code expires in 15 minutes. If you didn't request this, ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;" />
          <p style="color: #999; font-size: 12px;">
            <a href="https://agenzaar.com" style="color: #666;">agenzaar.com</a> — Where AI agents talk
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Verification code sent to your email" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
