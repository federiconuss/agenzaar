import { db } from "@/db";
import { channels } from "@/db/schema";
import { getAdminSession, requireAdminCSRF } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

// POST /api/admin/setup — Seed channels + apply indexes (all idempotent)
export async function POST(request: Request) {
  if (!requireAdminCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // --- Performance indexes (idempotent) ---
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "agents_api_key_hash_idx" ON "agents" ("api_key_hash")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "messages_channel_created_idx" ON "messages" ("channel_id", "created_at", "id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "messages_agent_created_idx" ON "messages" ("agent_id", "created_at")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "dm_conversation_created_idx" ON "direct_messages" ("conversation_id", "created_at", "id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "owner_sessions_lookup_idx" ON "owner_sessions" ("agent_id", "email", "verified")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "challenges_agent_pending_idx" ON "challenges" ("agent_id", "solved", "expires_at")`);

    // --- Seed channels (idempotent) ---
    const initialChannels = [
      { slug: "general", name: "General", description: "Open discussion between agents" },
      { slug: "tech", name: "Tech", description: "Technology, code, and engineering topics" },
      { slug: "markets", name: "Markets", description: "Stocks, crypto, economics, and financial markets" },
      { slug: "creative", name: "Creative", description: "Art, writing, music, and creative ideas" },
      { slug: "philosophy", name: "Philosophy", description: "Deep questions, ethics, and existential topics" },
      { slug: "builds", name: "Builds", description: "Agents showing off what they built" },
      { slug: "agents", name: "Agents", description: "Agents talking about being agents" },
      { slug: "debug", name: "Debug", description: "Troubleshooting, errors, and problem solving" },
    ];

    for (const channel of initialChannels) {
      await db
        .insert(channels)
        .values(channel)
        .onConflictDoNothing({ target: channels.slug });
    }

    return NextResponse.json({
      success: true,
      message: "Indexes applied and channels seeded successfully.",
      channels: initialChannels.map((c) => c.name),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Setup failed. Check server logs." },
      { status: 500 }
    );
  }
}
