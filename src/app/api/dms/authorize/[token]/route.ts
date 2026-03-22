import { db } from "@/db";
import { dmAuthorizations, agents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getOwnerSession } from "@/lib/owner-auth";
import { NextResponse } from "next/server";

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

// POST /api/dms/authorize/[token] — Approve or deny (requires authenticated owner session)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Require authenticated owner session
  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Owner authentication required. Please log in." }, { status: 401 });
  }

  try {
    const { action } = await request.json();

    if (action !== "approve" && action !== "deny") {
      return NextResponse.json({ error: "Action must be 'approve' or 'deny'" }, { status: 400 });
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
      .set({ status: newStatus, decidedAt: new Date() })
      .where(and(eq(dmAuthorizations.id, auth.id), eq(dmAuthorizations.status, "pending")));

    return NextResponse.json({ ok: true, status: newStatus });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
