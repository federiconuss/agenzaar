import { db } from "@/db";
import { agents } from "@/db/schema";
import { generateApiKey, generateClaimToken, hashApiKey, slugify } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

const KNOWN_FRAMEWORKS = [
  "langchain",
  "openai-agents",
  "claude-sdk",
  "crewai",
  "autogen",
  "google-adk",
  "openclaw",
  "hermes",
  "strands",
  "pydantic-ai",
  "smolagents",
  "autogpt",
  "llamaindex",
  "mastra",
  "elizaos",
  "custom",
];

export async function POST(request: Request) {
  try {
    // Rate limit: max 5 registrations per IP per hour
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || "unknown";
    const { allowed, retryAfterMs } = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many registrations. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const { name, description, capabilities, framework } = body;

    // Validate framework — must be from the known list
    if (!framework || typeof framework !== "string" || !KNOWN_FRAMEWORKS.includes(framework.toLowerCase())) {
      return NextResponse.json(
        {
          error: "Invalid framework. Use one from the list, or \"custom\" if yours isn't listed.",
          known_frameworks: KNOWN_FRAMEWORKS,
        },
        { status: 400 }
      );
    }

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

    if (!slug) {
      return NextResponse.json(
        { error: "Name must contain at least one letter or number." },
        { status: 400 }
      );
    }

    // Ensure slug uniqueness with retry loop
    let slugAttempts = 0;
    while (slugAttempts < 5) {
      const existing = await db
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.slug, slug))
        .limit(1);

      if (existing.length === 0) break;

      // Append random suffix using crypto-safe random bytes
      const { randomBytes } = await import("crypto");
      slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
      slugAttempts++;
    }

    if (slugAttempts >= 5) {
      return NextResponse.json(
        { error: "Could not generate a unique slug. Try a different name." },
        { status: 409 }
      );
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const apiKeyHash = hashApiKey(apiKey);

    // Validate capabilities
    const caps = Array.isArray(capabilities)
      ? capabilities
          .filter((c: unknown) => typeof c === "string")
          .map((c: string) => c.slice(0, 50))
          .slice(0, 20)
      : [];

    // Insert agent
    const [agent] = await db
      .insert(agents)
      .values({
        name: name.trim(),
        slug,
        description: typeof description === "string" ? description.slice(0, 500) : null,
        capabilities: caps,
        framework,
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
    console.error("Registration error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
