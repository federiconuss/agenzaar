import { db } from "@/db";
import { dmAuthorizations, agents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getOwnerSession, requireOwnerCSRF } from "@/lib/owner-auth";
import { dmAuthActionSchema, parseBody } from "@/lib/schemas";
import { hashCode } from "@/lib/crypto";
import { NextResponse } from "next/server";

// GET /api/dms/authorize/[token] — Get authorization request details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const tokenHash = hashCode(token);

  try {
    const [auth] = await db
      .select({
        id: dmAuthorizations.id,
        status: dmAuthorizations.status,
        requesterId: dmAuthorizations.requesterId,
        targetId: dmAuthorizations.targetId,
        expiresAt: dmAuthorizations.expiresAt,
      })
      .from(dmAuthorizations)
      .where(eq(dmAuthorizations.token, tokenHash))
      .limit(1);

    if (!auth) {
      return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
    }

    // Check expiration for pending tokens
    if (auth.status === "pending" && auth.expiresAt && new Date() > new Date(auth.expiresAt)) {
      return NextResponse.json({ error: "This link has expired. The agent must send a new DM request." }, { status: 410 });
    }

    // Get agent names — minimal metadata only
    const [requester] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, auth.requesterId))
      .limit(1);

    const [target] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, auth.targetId))
      .limit(1);

    return NextResponse.json({
      status: auth.status,
      requester: requester ? { name: requester.name } : null,
      target: target ? { name: target.name } : null,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/dms/authorize/[token] — Approve or deny (requires authenticated owner session + CSRF)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!requireOwnerCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { token } = await params;
  const tokenHash = hashCode(token);

  // Require authenticated owner session
  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Owner authentication required. Please log in." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = parseBody(dmAuthActionSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { action } = parsed.data;

    // Find the authorization and verify it's still pending
    const [auth] = await db
      .select({
        id: dmAuthorizations.id,
        status: dmAuthorizations.status,
        targetId: dmAuthorizations.targetId,
        expiresAt: dmAuthorizations.expiresAt,
      })
      .from(dmAuthorizations)
      .where(eq(dmAuthorizations.token, tokenHash))
      .limit(1);

    if (!auth) {
      return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
    }

    if (auth.status !== "pending") {
      return NextResponse.json({ error: `This request has already been ${auth.status}.` }, { status: 400 });
    }

    // Check expiration
    if (auth.expiresAt && new Date() > new Date(auth.expiresAt)) {
      return NextResponse.json({ error: "This link has expired. The agent must send a new DM request." }, { status: 410 });
    }

    // Verify the authenticated owner is the owner of the target agent
    const [targetAgent] = await db
      .select({ id: agents.id, ownerEmail: agents.ownerEmail })
      .from(agents)
      .where(eq(agents.id, auth.targetId))
      .limit(1);

    if (!targetAgent) {
      return NextResponse.json({ error: "Target agent not found." }, { status: 404 });
    }

    if (
      targetAgent.id !== session.agentId ||
      !targetAgent.ownerEmail ||
      targetAgent.ownerEmail.toLowerCase() !== session.email
    ) {
      return NextResponse.json({ error: "You are not the owner of the target agent." }, { status: 403 });
    }

    const newStatus = action === "approve" ? "approved" : "denied";

    await db
      .update(dmAuthorizations)
      .set({ status: newStatus, decidedAt: new Date(), token: null })
      .where(and(eq(dmAuthorizations.id, auth.id), eq(dmAuthorizations.status, "pending")));

    return NextResponse.json({ ok: true, status: newStatus });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
