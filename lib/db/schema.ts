import { relations } from "drizzle-orm"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    // nanoid primary key (generated at insert time via Drizzle)
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // third-party user id (e.g. Clerk)
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    // seed for the bot's face; defaults to a nanoid
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    // what the bot is for, in a phrase
    job: text("job").notNull(),
    // how it should go about the job
    instructions: text("instructions"),
    // third-party sandbox id, created lazily later
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("bots_user_id_idx").on(t.userId)]
)

export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert

// Validation schema generated from the `bots` table with drizzle-zod.
export const insertBotSchema = createInsertSchema(bots, {
  name: (schema) =>
    schema
      .trim()
      .min(1, "Give your bot a name.")
      .max(50, "Keep the name under 50 characters."),
  job: (schema) =>
    schema
      .trim()
      .min(1, "Tell your bot what to do.")
      .max(120, "Keep the job under 120 characters."),
  instructions: (schema) =>
    schema.max(1000, "Keep instructions under 1000 characters.").optional(),
})

// The fields a caller is allowed to supply when creating a bot. `userId`,
// `id`, `createdAt`, and `sandboxId` are owned by the server.
export const createBotSchema = insertBotSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  sandboxId: true,
})

export type CreateBotInput = z.infer<typeof createBotSchema>

// The same editable fields plus the record id, so an update can't touch any
// column a client isn't allowed to set.
export const updateBotSchema = createBotSchema.extend({
  id: z.string().min(1, "Missing bot id."),
})

export type UpdateBotInput = z.infer<typeof updateBotSchema>

export const chatKindEnum = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    // nanoid primary key (generated at insert time via Drizzle)
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    // third-party user id (e.g. Clerk)
    userId: text("user_id").notNull(),
    // direct chats pair the user with one bot; group chats have a name
    kind: chatKindEnum("kind").notNull().default("direct"),
    // only set for group chats; direct chats use the bot's name
    name: text("name"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("chats_user_id_idx").on(t.userId)]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.botId] }),
    index("chat_members_bot_id_idx").on(t.botId),
  ]
)

// One row per Clerk subscription period. `reservedMicros` prevents parallel
// turns from spending the same remaining AI budget before provider usage lands.
export const usagePeriods = pgTable(
  "usage_periods",
  {
    userId: text("user_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    aiCostMicros: integer("ai_cost_micros").notNull().default(0),
    reservedMicros: integer("reserved_micros").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.periodStart] })]
)

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costMicros: integer("cost_micros").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("usage_ledger_user_period_idx").on(t.userId, t.periodStart)]
)

// Sandbox slots are independent of billing renewal: stopped sandboxes still
// occupy storage and must count toward the user's three-sandbox ceiling.
export const userSandboxUsage = pgTable("user_sandbox_usage", {
  userId: text("user_id").primaryKey(),
  activeSandboxes: integer("active_sandboxes").notNull().default(0),
})

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type ChatMember = typeof chatMembers.$inferSelect
export type NewChatMember = typeof chatMembers.$inferInsert

// A group chat is a name plus the bots that join it; both come from the client.
// `chats.name` stays nullable in the table (direct chats have none), so a null
// name is rejected by `createGroupChat` rather than by this schema.
export const createGroupChatSchema = createInsertSchema(chats, {
  name: (schema) =>
    schema
      .trim()
      .min(1, "Give the group a name.")
      .max(50, "Keep the name under 50 characters."),
})
  .pick({ name: true })
  .extend({
    memberIds: z.array(z.string().min(1)).min(2, "Pick at least two bots."),
  })

export type CreateGroupChatInput = z.infer<typeof createGroupChatSchema>

// The same fields as create, plus the chat id, so an update can't touch a
// column a client isn't allowed to set.
export const updateGroupChatSchema = createGroupChatSchema.extend({
  id: z.string().min(1, "Missing group chat id."),
})

export type UpdateGroupChatInput = z.infer<typeof updateGroupChatSchema>

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))
