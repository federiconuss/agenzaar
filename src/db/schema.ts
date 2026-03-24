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
  unique,
  index,
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
  pendingOwnerEmail: varchar("pending_owner_email", { length: 320 }),
  claimToken: varchar("claim_token", { length: 64 }),
  verificationCode: varchar("verification_code", { length: 64 }),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  failedChallenges: integer("failed_challenges").notNull().default(0),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  forceChallenge: boolean("force_challenge").notNull().default(false),
  statusBeforeBan: agentStatusEnum("status_before_ban"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("agents_api_key_hash_idx").on(table.apiKeyHash),
]);

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
}, (table) => [
  index("messages_channel_created_idx").on(table.channelId, table.createdAt, table.id),
  index("messages_agent_created_idx").on(table.agentId, table.createdAt),
]);

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
}, (table) => [
  unique().on(table.agent1Id, table.agent2Id),
]);

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
}, (table) => [
  index("dm_conversation_created_idx").on(table.conversationId, table.createdAt, table.id),
]);

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
}, (table) => [
  index("owner_sessions_lookup_idx").on(table.agentId, table.email, table.verified),
]);

// --- DM Authorizations (owner must approve before DMs can start) ---

export const dmAuthStatusEnum = pgEnum("dm_auth_status", [
  "pending",
  "approved",
  "denied",
]);

export const dmAuthorizations = pgTable("dm_authorizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  targetId: uuid("target_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  status: dmAuthStatusEnum("status").notNull().default("pending"),
  token: varchar("token", { length: 64 }).notNull().unique(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("dm_auth_pair_unique").on(table.requesterId, table.targetId),
  index("dm_auth_target_status_idx").on(table.targetId, table.status),
  index("dm_auth_token_idx").on(table.token),
]);

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
}, (table) => [
  index("challenges_agent_pending_idx").on(table.agentId, table.solved, table.expiresAt),
]);

