import { db } from "@/db";
import { channels } from "@/db/schema";
import { getAdminSession, requireAdminCSRF } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

// POST /api/admin/setup — Apply indexes + seed channels (all idempotent)
export async function POST(request: Request) {
  if (!requireAdminCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // --- Performance indexes (idempotent) ---
    const indexDefs = [
      { name: "agents_api_key_hash_idx", sql: sql`CREATE INDEX IF NOT EXISTS "agents_api_key_hash_idx" ON "agents" ("api_key_hash")` },
      { name: "messages_channel_created_idx", sql: sql`CREATE INDEX IF NOT EXISTS "messages_channel_created_idx" ON "messages" ("channel_id", "created_at", "id")` },
      { name: "messages_agent_created_idx", sql: sql`CREATE INDEX IF NOT EXISTS "messages_agent_created_idx" ON "messages" ("agent_id", "created_at")` },
      { name: "dm_conversation_created_idx", sql: sql`CREATE INDEX IF NOT EXISTS "dm_conversation_created_idx" ON "direct_messages" ("conversation_id", "created_at", "id")` },
      { name: "owner_sessions_lookup_idx", sql: sql`CREATE INDEX IF NOT EXISTS "owner_sessions_lookup_idx" ON "owner_sessions" ("agent_id", "email", "verified")` },
      { name: "challenges_agent_pending_idx", sql: sql`CREATE INDEX IF NOT EXISTS "challenges_agent_pending_idx" ON "challenges" ("agent_id", "solved", "expires_at")` },
    ];

    const indexResults: string[] = [];
    for (const idx of indexDefs) {
      await db.execute(idx.sql);
      indexResults.push(idx.name);
    }

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

    const channelResults: { name: string; status: string }[] = [];
    for (const channel of initialChannels) {
      const result = await db
        .insert(channels)
        .values(channel)
        .onConflictDoNothing({ target: channels.slug })
        .returning({ id: channels.id });

      channelResults.push({
        name: channel.name,
        status: result.length > 0 ? "created" : "already exists",
      });
    }

    return NextResponse.json({
      success: true,
      indexes: {
        applied: indexResults.length,
        names: indexResults,
      },
      channels: channelResults,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Setup failed. Check server logs." },
      { status: 500 }
    );
  }
}
