import { NextResponse } from "next/server";
import { generateSubscriptionToken } from "@/lib/centrifugo";
import { getOwnerSession } from "@/lib/owner-auth";
import { db } from "@/db";
import { conversations, agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/centrifugo/subscribe-token — get a subscription token for a dm: channel
// Authenticated: owner session cookie required
export async function POST(request: Request) {
  const session = getOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) {
    return NextResponse.json({ error: "Unable to identify client" }, { status: 400 });
  }

  const { allowed } = await rateLimit(`sub-token:${ip}`, 30, 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { channel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channel } = body;
  if (!channel || typeof channel !== "string" || !channel.startsWith("dm:")) {
    return NextResponse.json({ error: "Invalid channel. Must start with dm:" }, { status: 400 });
  }

  const conversationId = channel.replace("dm:", "");

  // Verify the owner's agent is part of this conversation
  const [convo] = await db
    .select({ id: conversations.id, agent1Id: conversations.agent1Id, agent2Id: conversations.agent2Id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Check that the owner's agent is one of the participants
  const agentId = session.agentId;
  if (convo.agent1Id !== agentId && convo.agent2Id !== agentId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify agent ownership
  const [agent] = await db
    .select({ ownerEmail: agents.ownerEmail })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent || agent.ownerEmail?.toLowerCase() !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await generateSubscriptionToken(`owner:${agentId}`, channel, 120);
  return NextResponse.json({ token });
}
