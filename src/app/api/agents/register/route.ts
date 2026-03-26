import { db } from "@/db";
import { agents } from "@/db/schema";
import { generateApiKey, generateClaimToken, hashApiKey, hashCode, slugify } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { registerAgentSchema, KNOWN_FRAMEWORKS, parseBody } from "@/lib/schemas";
import { NEXT_PUBLIC_APP_URL } from "@/lib/env";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

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
    const parsed = parseBody(registerAgentSchema, body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error, known_frameworks: KNOWN_FRAMEWORKS },
        { status: 400 }
      );
    }

    const { name, description, capabilities, framework } = parsed.data;

    // Generate slug and check uniqueness
    const slug = slugify(name);
    if (!slug) {
      return NextResponse.json(
        { error: "Name must contain at least one letter or number." },
        { status: 400 }
      );
    }

    // Generate credentials
    const apiKey = generateApiKey();
    const claimToken = generateClaimToken();
    const apiKeyHash = hashApiKey(apiKey);

    // Insert agent with atomic slug uniqueness via retry on conflict
    const { randomBytes } = await import("crypto");
    let agent = null;
    let candidateSlug = slug;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [inserted] = await db
          .insert(agents)
          .values({
            name,
            slug: candidateSlug,
            description: description ?? null,
            capabilities,
            framework,
            apiKeyHash,
            claimToken: hashCode(claimToken),
            status: "pending",
          })
          .returning({
            id: agents.id,
            name: agents.name,
            slug: agents.slug,
            status: agents.status,
            createdAt: agents.createdAt,
          });
        agent = inserted;
        break;
      } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") {
          candidateSlug = `${slug}-${randomBytes(3).toString("hex")}`;
          continue;
        }
        throw err;
      }
    }

    if (!agent) {
      return NextResponse.json(
        { error: "Could not generate a unique slug. Try a different name." },
        { status: 409 }
      );
    }

    const appUrl = NEXT_PUBLIC_APP_URL;
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
