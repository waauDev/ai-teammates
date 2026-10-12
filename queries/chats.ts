import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

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
  kind: "direct" | "group"
  name: string | null
  // Every bot in the chat, in join order. A direct chat has exactly one.
  members: ChatBot[]
}

// The bot a turn should speak as: the requested one when it is a member of the
// chat, otherwise the first member. A direct chat has a single member, so the
// request is always honoured there.
export async function getChatBot(
  chatId: string,
  botId?: string
): Promise<ChatBot | null> {
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
    // Matching on `botId` also enforces membership: a bot outside the chat
    // matches no row.
    .where(
      botId
        ? and(eq(chats.id, chatId), eq(bots.id, botId))
        : eq(chats.id, chatId)
    )
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
  const rows = await db
    .select({
      id: chats.id,
      kind: chats.kind,
      name: chats.name,
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
    // Join order; the first member is the chat's default bot.
    .orderBy(asc(chatMembers.joinedAt))

  const first = rows[0]

  if (!first) {
    return null
  }

  return {
    id: first.id,
    kind: first.kind,
    name: first.name,
    members: rows.map((row) => ({
      id: row.botId,
      name: row.botName,
      job: row.botJob,
      instructions: row.botInstructions,
      avatar: row.botAvatar,
      sandboxId: row.botSandboxId,
    })),
  }
}
