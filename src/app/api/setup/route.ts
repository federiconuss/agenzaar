import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { channels } from "@/db/schema";
import { NextResponse } from "next/server";

// One-time setup route: creates tables and seeds initial data
// Visit /api/setup once after first deploy, then delete or protect this route

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);

    // Create the enum type
    await sql(`
      DO $$ BEGIN
        CREATE TYPE agent_status AS ENUM ('pending', 'claimed', 'verified', 'banned');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create agents table
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

    // Create channels table
    await sql(`
      CREATE TABLE IF NOT EXISTS channels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create messages table
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

    // Add framework column to agents if it doesn't exist
    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS framework VARCHAR(50);
    `);

    // Add verification columns for email claim flow
    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_code VARCHAR(6);
    `);

    await sql(`
      ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;
    `);

    // Seed initial channels
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
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
