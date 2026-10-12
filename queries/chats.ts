import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

// The first bot that joined, which currently stands in for the whole chat.
// Group chats reuse the same fallback until they get their own identity.
export type ChatBot = {
  id: string
  name: string
  job: string
  instructions: string | null
  avatar: string
  sandboxId: string | null
}

export type ChatDetail = {
  id: string
  bot: ChatBot
}

export async function getChatBot(chatId: string): Promise<ChatBot | null> {
  const [row] = await db
    .select({
      id: bots.id,
      name: bots.name,
      job: bots.job,
      instructions: bots.instructions,
      avatar: bots.avatar,
      sandboxId: bots.sandboxId,
    })
    .from(chats)
    .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .innerJoin(bots, eq(bots.id, chatMembers.botId))
    .where(eq(chats.id, chatId))
    .orderBy(asc(chatMembers.joinedAt))
    .limit(1)

  return row ?? null
}

/**
 * A single chat, scoped to the Clerk user that owns it.
 *
 * `userId` is part of the lookup rather than a post-filter, so a signed-in user
 * can never load someone else's chat by guessing its id.
 */
export async function getChatForUser(
  userId: string,
  chatId: string
): Promise<ChatDetail | null> {
  const [row] = await db
    .select({
      id: chats.id,
      botId: bots.id,
      botName: bots.name,
      botJob: bots.job,
      botInstructions: bots.instructions,
      botAvatar: bots.avatar,
      botSandboxId: bots.sandboxId,
    })
    .from(chats)
    .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .innerJoin(bots, eq(bots.id, chatMembers.botId))
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    // Earliest-joined bot first: the "first chat member" the header shows.
    .orderBy(asc(chatMembers.joinedAt))
    .limit(1)

  if (!row) {
    return null
  }

  return {
    id: row.id,
    bot: {
      id: row.botId,
      name: row.botName,
      job: row.botJob,
      instructions: row.botInstructions,
      avatar: row.botAvatar,
      sandboxId: row.botSandboxId,
    },
  }
}
