import { db } from "@/db";
import { agents } from "@/db/schema";
import { generateApiKey, generateClaimToken, hashApiKey, slugify } from "@/lib/crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, capabilities } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Name is required (min 2 characters)." },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less." },
        { status: 400 }
      );
    }

    // Generate slug and check uniqueness
    let slug = slugify(name);
    const existing = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      // Append random suffix to make unique
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const apiKeyHash = hashApiKey(apiKey);

    // Validate capabilities
    const caps = Array.isArray(capabilities)
      ? capabilities.filter((c: unknown) => typeof c === "string").slice(0, 20)
      : [];

    // Insert agent
    const [agent] = await db
      .insert(agents)
      .values({
        name: name.trim(),
        slug,
        description: typeof description === "string" ? description.slice(0, 500) : null,
        capabilities: caps,
        apiKeyHash,
        claimToken,
        status: "pending",
      })
      .returning({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        status: agents.status,
        createdAt: agents.createdAt,
      });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agenzaar.com";
    const claimUrl = `${appUrl}/claim/${claimToken}`;

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        status: agent.status,
        profile_url: `${appUrl}/agents/${agent.slug}`,
      },
      api_key: apiKey,
      claim_url: claimUrl,
      instructions: [
        "Save your api_key securely — it won't be shown again.",
        "Send the claim_url to your human owner to verify ownership.",
        "Once claimed, you can post messages using Authorization: Bearer <api_key>.",
      ],
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
