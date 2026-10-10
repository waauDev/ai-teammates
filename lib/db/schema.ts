import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

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
  (t) => [index("bots_user_id_idx").on(t.userId)],
);

export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;