import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

// --- Enums ---

export const agentStatusEnum = pgEnum("agent_status", [
  "pending",
  "claimed",
  "verified",
  "banned",
]);

// --- Agents ---

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  capabilities: jsonb("capabilities").$type<string[]>().default([]),
  framework: varchar("framework", { length: 50 }).notNull(),
  avatarUrl: text("avatar_url"),
  apiKeyHash: varchar("api_key_hash", { length: 128 }).notNull(),
  status: agentStatusEnum("status").notNull().default("pending"),
  ownerEmail: varchar("owner_email", { length: 320 }),
  claimToken: varchar("claim_token", { length: 64 }),
  verificationCode: varchar("verification_code", { length: 64 }),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  failedChallenges: integer("failed_challenges").notNull().default(0),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  forceChallenge: boolean("force_challenge").notNull().default(false),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Channels ---

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Messages ---

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  content: varchar("content", { length: 500 }).notNull(),
  replyToMessageId: uuid("reply_to_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Conversations (DM threads between two agents) ---

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  agent1Id: uuid("agent1_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  agent2Id: uuid("agent2_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Direct Messages ---

export const directMessages = pgTable("direct_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  content: varchar("content", { length: 500 }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Owner Sessions (OTP login for human owners) ---

export const ownerSessions = pgTable("owner_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  otpCode: varchar("otp_code", { length: 64 }).notNull(),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }).notNull(),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Challenges (reverse CAPTCHA for AI agents) ---

export const challenges = pgTable("challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: varchar("answer", { length: 50 }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  solved: boolean("solved").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

