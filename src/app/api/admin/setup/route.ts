import { db } from "@/db";
import { channels } from "@/db/schema";
import { getAdminSession, requireAdminCSRF } from "@/lib/auth/admin-auth";
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
    // --- DM Authorizations: enum + table (idempotent) ---
    await db.execute(sql`DO $$ BEGIN CREATE TYPE dm_auth_status AS ENUM ('pending', 'approved', 'denied'); EXCEPTION WHEN duplicate_object THEN null; END $$`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS "dm_authorizations" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "requester_id" UUID NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
      "target_id" UUID NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
      "status" "dm_auth_status" NOT NULL DEFAULT 'pending',
      "token" VARCHAR(64) NOT NULL UNIQUE,
      "decided_at" TIMESTAMPTZ,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("requester_id", "target_id")
    )`);

    // Make dm_authorizations.token nullable (must run before backfill inserts with NULL)
    await db.execute(sql`ALTER TABLE "dm_authorizations" ALTER COLUMN "token" DROP NOT NULL`);
    // Drop unique constraint on token (nullified tokens would violate it)
    await db.execute(sql`DO $$ BEGIN
      ALTER TABLE "dm_authorizations" DROP CONSTRAINT IF EXISTS "dm_authorizations_token_unique";
    EXCEPTION WHEN undefined_object THEN null;
    END $$`);

    // --- Migrate existing conversations to approved authorizations (BOTH directions) ---
    // Decided authorizations have null tokens (invalidated after decision)
    // Direction 1: agent1 → agent2
    await db.execute(sql`INSERT INTO "dm_authorizations" ("requester_id", "target_id", "status", "token", "decided_at", "created_at")
      SELECT c.agent1_id, c.agent2_id, 'approved', NULL, NOW(), c.created_at
      FROM conversations c
      WHERE NOT EXISTS (
        SELECT 1 FROM dm_authorizations da
        WHERE da.requester_id = c.agent1_id AND da.target_id = c.agent2_id
      )`);
    // Direction 2: agent2 → agent1
    await db.execute(sql`INSERT INTO "dm_authorizations" ("requester_id", "target_id", "status", "token", "decided_at", "created_at")
      SELECT c.agent2_id, c.agent1_id, 'approved', NULL, NOW(), c.created_at
      FROM conversations c
      WHERE NOT EXISTS (
        SELECT 1 FROM dm_authorizations da
        WHERE da.requester_id = c.agent2_id AND da.target_id = c.agent1_id
      )`);

    // --- Schema migrations (idempotent) ---
    await db.execute(sql`ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "pending_owner_email" VARCHAR(320)`);
    await db.execute(sql`ALTER TABLE "owner_sessions" ADD COLUMN IF NOT EXISTS "otp_status" VARCHAR(10) NOT NULL DEFAULT 'pending'`);
    // Backfill + drop legacy verified column (idempotent: only runs if column still exists)
    await db.execute(sql`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'owner_sessions' AND column_name = 'verified') THEN
        UPDATE "owner_sessions" SET "otp_status" = 'used' WHERE "verified" = true AND "otp_status" = 'pending';
        ALTER TABLE "owner_sessions" DROP COLUMN "verified";
      END IF;
    END $$`);
    await db.execute(sql`ALTER TABLE "dm_authorizations" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ`);
    // Set expiration on pending DM auth tokens that don't have one (7 days from creation)
    await db.execute(sql`UPDATE "dm_authorizations" SET "expires_at" = "created_at" + INTERVAL '7 days' WHERE "expires_at" IS NULL AND "status" = 'pending'`);

    // Note: tokens (claim_token, dm_authorizations.token) are now stored as
    // SHA-256 hashes by the application code. Pre-existing raw tokens in the DB
    // are harmless — they simply never match because the code hashes the input
    // before lookup. No migration or cleanup needed; DM auth tokens expire via
    // 7-day TTL, and orphaned claim tokens remain inert (no expiration, but
    // unreachable by code since lookup requires hash match).

    // --- Performance indexes (idempotent) ---
    const indexDefs = [
      { name: "agents_api_key_hash_idx", sql: sql`CREATE INDEX IF NOT EXISTS "agents_api_key_hash_idx" ON "agents" ("api_key_hash")` },
      { name: "messages_channel_created_idx", sql: sql`CREATE INDEX IF NOT EXISTS "messages_channel_created_idx" ON "messages" ("channel_id", "created_at", "id")` },
      { name: "messages_agent_created_idx", sql: sql`CREATE INDEX IF NOT EXISTS "messages_agent_created_idx" ON "messages" ("agent_id", "created_at")` },
      { name: "dm_conversation_created_idx", sql: sql`CREATE INDEX IF NOT EXISTS "dm_conversation_created_idx" ON "direct_messages" ("conversation_id", "created_at", "id")` },
      { name: "owner_sessions_status_idx", sql: sql`CREATE INDEX IF NOT EXISTS "owner_sessions_status_idx" ON "owner_sessions" ("agent_id", "email", "otp_status")` },
      { name: "challenges_agent_pending_idx", sql: sql`CREATE INDEX IF NOT EXISTS "challenges_agent_pending_idx" ON "challenges" ("agent_id", "solved", "expires_at")` },
      { name: "dm_auth_target_status_idx", sql: sql`CREATE INDEX IF NOT EXISTS "dm_auth_target_status_idx" ON "dm_authorizations" ("target_id", "status")` },
      { name: "dm_auth_token_idx", sql: sql`CREATE INDEX IF NOT EXISTS "dm_auth_token_idx" ON "dm_authorizations" ("token")` },
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
  } catch (e) {
    console.error("Setup failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { success: false, error: "Setup failed. Check server logs for details." },
      { status: 500 }
    );
  }
}
