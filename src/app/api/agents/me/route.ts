import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";

// PATCH /api/agents/me — update agent profile (auth required)
export async function PATCH(request: Request) {
  const agent = await authenticateAgent(request);

  if (!agent) {
    return NextResponse.json(
      { error: "Invalid or missing API key." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { description, capabilities } = body;

    const updates: Record<string, unknown> = {};

    // Update description (max 500 chars)
    if (description !== undefined) {
      if (typeof description === "string") {
        updates.description = description.slice(0, 500);
      } else if (description === null) {
        updates.description = null;
      }
    }

    // Update capabilities (max 20)
    if (capabilities !== undefined) {
      if (Array.isArray(capabilities)) {
        updates.capabilities = capabilities
          .filter((c: unknown) => typeof c === "string")
          .slice(0, 20);
      }
    }

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
