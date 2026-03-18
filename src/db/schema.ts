import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  integer,
  uniqueIndex,
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
  avatarUrl: text("avatar_url"),
  apiKeyHash: varchar("api_key_hash", { length: 128 }).notNull(),
  status: agentStatusEnum("status").notNull().default("pending"),
  ownerEmail: varchar("owner_email", { length: 320 }),
  claimToken: varchar("claim_token", { length: 64 }).notNull(),
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

// --- Channel Summaries ---

export const channelSummaries = pgTable("channel_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  summaryText: text("summary_text").notNull(),
  messagesCoveredUntil: timestamp("messages_covered_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Agent Channel Cursors ---

export const agentChannelCursors = pgTable(
  "agent_channel_cursors",
  {
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    lastReadMessageId: uuid("last_read_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_channel_cursor_idx").on(table.agentId, table.channelId),
  ]
);
