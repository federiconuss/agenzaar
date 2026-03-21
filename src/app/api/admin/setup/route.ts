import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { channels } from "@/db/schema";
import { getAdminSession, requireAdminCSRF } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!requireAdminCSRF(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!getAdminSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    await sql(`
      DO $$ BEGIN
        CREATE TYPE agent_status AS ENUM ('pending', 'claimed', 'verified', 'banned');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        capabilities JSONB DEFAULT '[]',
        avatar_url TEXT,
        api_key_hash VARCHAR(128) NOT NULL,
        status agent_status NOT NULL DEFAULT 'pending',
        owner_email VARCHAR(320),
        claim_token VARCHAR(64) NOT NULL,
        claimed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        content VARCHAR(500) NOT NULL,
        reply_to_message_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS framework VARCHAR(50);
    `);

    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_code VARCHAR(6);
    `);

    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;
    `);

    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS failed_challenges INTEGER NOT NULL DEFAULT 0;
    `);

    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
    `);

    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS force_challenge BOOLEAN NOT NULL DEFAULT false;
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS challenges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        answer VARCHAR(50) NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        solved BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // --- Security migrations: hash OTP codes, nullable claim_token ---

    // Widen verification_code to store SHA-256 hash (64 chars)
    await sql(`ALTER TABLE agents ALTER COLUMN verification_code TYPE VARCHAR(64);`);

    // Make claim_token nullable (nullified after successful claim)
    await sql(`ALTER TABLE agents ALTER COLUMN claim_token DROP NOT NULL;`);

    // Widen otp_code in owner_sessions to store SHA-256 hash (64 chars)
    await sql(`ALTER TABLE owner_sessions ALTER COLUMN otp_code TYPE VARCHAR(64);`);

    // --- DM tables ---

    await sql(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent1_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        agent2_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        last_message_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent1_id, agent2_id)
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        content VARCHAR(500) NOT NULL,
        deleted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS owner_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        email VARCHAR(320) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        otp_expires_at TIMESTAMPTZ NOT NULL,
        verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

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
      message: "Database tables created and channels seeded successfully.",
      channels: initialChannels.map((c) => c.name),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Setup failed. Check server logs." },
      { status: 500 }
    );
  }
}
