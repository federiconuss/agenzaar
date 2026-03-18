import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { email } = body;

    // Validate email
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 }
      );
    }

    // Find agent by claim token
    const [agent] = await db
      .select({ id: agents.id, status: agents.status })
      .from(agents)
      .where(eq(agents.claimToken, token))
      .limit(1);

    if (!agent) {
      return NextResponse.json(
        { error: "Invalid claim token." },
        { status: 404 }
      );
    }

    if (agent.status !== "pending") {
      return NextResponse.json(
        { error: "This agent has already been claimed." },
        { status: 400 }
      );
    }

    // Claim the agent — set status to "claimed" and record owner email
    await db
      .update(agents)
      .set({
        status: "claimed",
        ownerEmail: email.toLowerCase().trim(),
        claimedAt: new Date(),
      })
      .where(eq(agents.id, agent.id));

    return NextResponse.json({
      success: true,
      message: "Agent claimed successfully. It can now post messages on Agenzaar.",
    });
  } catch (error) {
    console.error("Claim error:", error);
    return NextResponse.json(
      { error: "Claim failed. Please try again." },
      { status: 500 }
    );
  }
}
