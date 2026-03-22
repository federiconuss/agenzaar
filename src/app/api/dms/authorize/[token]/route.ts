import { db } from "@/db";
import { dmAuthorizations, agents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/dms/authorize/[token] — Get authorization request details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const [auth] = await db
      .select({
        id: dmAuthorizations.id,
        status: dmAuthorizations.status,
        requesterId: dmAuthorizations.requesterId,
        targetId: dmAuthorizations.targetId,
        createdAt: dmAuthorizations.createdAt,
      })
      .from(dmAuthorizations)
      .where(eq(dmAuthorizations.token, token))
      .limit(1);

    if (!auth) {
      return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
    }

    // Get agent names
    const [requester] = await db
      .select({ name: agents.name, slug: agents.slug })
      .from(agents)
      .where(eq(agents.id, auth.requesterId))
      .limit(1);

    const [target] = await db
      .select({ name: agents.name, slug: agents.slug })
      .from(agents)
      .where(eq(agents.id, auth.targetId))
      .limit(1);

    return NextResponse.json({
      status: auth.status,
      requester: requester ? { name: requester.name, slug: requester.slug } : null,
      target: target ? { name: target.name, slug: target.slug } : null,
      createdAt: auth.createdAt,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/dms/authorize/[token] — Approve or deny (requires owner email verification)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Rate limit by IP to prevent brute-force
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`dm-authorize:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const { action, email } = await request.json();

    if (action !== "approve" && action !== "deny") {
      return NextResponse.json({ error: "Action must be 'approve' or 'deny'" }, { status: 400 });
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Owner email is required to authorize this request." }, { status: 400 });
    }

    // Find the authorization and verify it's still pending
    const [auth] = await db
      .select({
        id: dmAuthorizations.id,
        status: dmAuthorizations.status,
        targetId: dmAuthorizations.targetId,
      })
      .from(dmAuthorizations)
      .where(eq(dmAuthorizations.token, token))
      .limit(1);

    if (!auth) {
      return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
    }

    if (auth.status !== "pending") {
      return NextResponse.json({ error: `This request has already been ${auth.status}.` }, { status: 400 });
    }

    // Verify the email matches the target agent's owner email
    const [targetAgent] = await db
      .select({ ownerEmail: agents.ownerEmail })
      .from(agents)
      .where(eq(agents.id, auth.targetId))
      .limit(1);

    if (!targetAgent?.ownerEmail || targetAgent.ownerEmail.toLowerCase() !== email.trim().toLowerCase()) {
      return NextResponse.json({ error: "Email does not match the agent's owner." }, { status: 403 });
    }

    const newStatus = action === "approve" ? "approved" : "denied";

    await db
      .update(dmAuthorizations)
      .set({ status: newStatus, decidedAt: new Date() })
      .where(and(eq(dmAuthorizations.id, auth.id), eq(dmAuthorizations.status, "pending")));

    return NextResponse.json({ ok: true, status: newStatus });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
