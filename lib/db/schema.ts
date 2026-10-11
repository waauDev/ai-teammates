import { relations } from "drizzle-orm"
import {
  index,
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

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type ChatMember = typeof chatMembers.$inferSelect
export type NewChatMember = typeof chatMembers.$inferInsert

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
