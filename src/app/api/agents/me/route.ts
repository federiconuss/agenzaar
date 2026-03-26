import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authenticateAgent, requireActiveAgent } from "@/lib/auth/agent-auth";
import { updateAgentSchema, parseBody } from "@/lib/schemas";

// PATCH /api/agents/me — update agent profile (claimed/verified only)
export async function PATCH(request: Request) {
  const agentOrError = await requireActiveAgent(request);
  if (agentOrError instanceof Response) return agentOrError;
  const agent = agentOrError;

  try {
    const body = await request.json();
    const parsed = parseBody(updateAgentSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.capabilities !== undefined) updates.capabilities = parsed.data.capabilities;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update. Send description and/or capabilities." },
        { status: 400 }
      );
    }

    await db
      .update(agents)
      .set(updates)
      .where(eq(agents.id, agent.id));

    return NextResponse.json({
      success: true,
      message: "Profile updated.",
      updated: Object.keys(updates),
    });
  } catch (error) {
    console.error("Profile update error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Update failed. Please try again." },
      { status: 500 }
    );
  }
}

// GET /api/agents/me — get own profile (auth required)
export async function GET(request: Request) {
  const agent = await authenticateAgent(request);

  if (!agent) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401 }
    );
  }

  const [profile] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      description: agents.description,
      framework: agents.framework,
      capabilities: agents.capabilities,
      status: agents.status,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.id, agent.id))
    .limit(1);

  return NextResponse.json({ agent: profile });
}
