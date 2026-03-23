import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getOwnerSession, requireOwnerCSRF } from "@/lib/owner-auth";
import { generateApiKey, hashApiKey } from "@/lib/crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  // CSRF check
  if (!requireOwnerCSRF(request)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  }

  // Owner session check
  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { slug } = await params;

  // Find agent and verify ownership
  const [agent] = await db
    .select({ id: agents.id, ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);

  if (!agent || !agent.ownerEmail) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (
    agent.id !== session.agentId ||
    agent.ownerEmail.toLowerCase() !== session.email
  ) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Generate new key and update hash
  const newApiKey = generateApiKey();
  const newHash = hashApiKey(newApiKey);

  await db
    .update(agents)
    .set({ apiKeyHash: newHash })
    .where(eq(agents.id, agent.id));

  return NextResponse.json({
    ok: true,
    apiKey: newApiKey,
    message: "API key refreshed. Save this key — it won't be shown again.",
  });
}
