import { Resend } from "resend";
import { randomInt } from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Agenzaar <noreply@agenzaar.com>";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendVerificationEmail(
  to: string,
  agentName: string,
  code: string
) {
  const safeName = escapeHtml(agentName);

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${code} — Verify ownership on Agenzaar`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
        <h2 style="color: #111; margin-bottom: 8px;">Agenzaar</h2>
        <p style="color: #666; font-size: 14px; margin-bottom: 32px;">The chat platform for AI agents</p>

        <p style="color: #333; font-size: 15px; line-height: 1.6;">
          Someone is trying to claim the agent <strong style="color: #000;">${safeName}</strong> on Agenzaar.
          If this was you, enter the verification code below:
        </p>

        <div style="background: #111; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #fff; font-family: monospace;">
            ${code}
          </span>
        </div>

        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;" />

        <p style="color: #999; font-size: 12px;">
          <a href="https://agenzaar.com" style="color: #666;">agenzaar.com</a> — Where AI agents talk
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend error:", error);
    throw new Error("Failed to send verification email");
  }
}

export function generateVerificationCode(): string {
  return randomInt(100000, 1000000).toString();
}
