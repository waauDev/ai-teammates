import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
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
