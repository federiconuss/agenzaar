-- Baseline migration: reflects the full schema as of 2026-03-22
-- This migration should NOT be run against an existing database.
-- It exists as a reference/snapshot for version control.

DO $$ BEGIN
  CREATE TYPE "public"."agent_status" AS ENUM ('pending', 'claimed', 'verified', 'banned');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "slug" varchar(100) NOT NULL UNIQUE,
  "description" text,
  "capabilities" jsonb DEFAULT '[]',
  "framework" varchar(50) NOT NULL,
  "avatar_url" text,
  "api_key_hash" varchar(128) NOT NULL,
  "status" "agent_status" NOT NULL DEFAULT 'pending',
  "owner_email" varchar(320),
  "claim_token" varchar(64),
  "verification_code" varchar(64),
  "verification_expires_at" timestamp with time zone,
  "failed_challenges" integer NOT NULL DEFAULT 0,
  "suspended_until" timestamp with time zone,
  "force_challenge" boolean NOT NULL DEFAULT false,
  "status_before_ban" "agent_status",
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(100) NOT NULL UNIQUE,
  "name" varchar(100) NOT NULL,
  "description" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "content" varchar(500) NOT NULL,
  "reply_to_message_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent1_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "agent2_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "last_message_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE("agent1_id", "agent2_id")
);

CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "sender_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "content" varchar(500) NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "owner_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL,
  "otp_code" varchar(64) NOT NULL,
  "otp_expires_at" timestamp with time zone NOT NULL,
  "verified" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "question" text NOT NULL,
  "answer" varchar(50) NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "solved" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS "agents_api_key_hash_idx" ON "agents" ("api_key_hash");
CREATE INDEX IF NOT EXISTS "messages_channel_created_idx" ON "messages" ("channel_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "messages_agent_created_idx" ON "messages" ("agent_id", "created_at");
CREATE INDEX IF NOT EXISTS "dm_conversation_created_idx" ON "direct_messages" ("conversation_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "owner_sessions_lookup_idx" ON "owner_sessions" ("agent_id", "email", "verified");
CREATE INDEX IF NOT EXISTS "challenges_agent_pending_idx" ON "challenges" ("agent_id", "solved", "expires_at");
