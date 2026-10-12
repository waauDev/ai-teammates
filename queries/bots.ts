import { format, isThisYear, isToday, isYesterday } from "date-fns"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

export type ChatListItem = {
  id: string
  kind: "direct" | "group"
  // Direct chats fall back to the bot's name; group chats use their own name.
  title: string
  // Seeds for every bot in the chat, in join order. A direct chat has one; a
  // group chat stacks them into a single face in the sidebar.
  memberAvatars: string[]
  lastMessagePreview: string | null
  lastMessageAtLabel: string
}

/**
 * The chats that belong to a single Clerk user, each paired with the bots that
 * are in it.
 *
 * Every chat is scoped to `userId`, so one user can never read another user's
 * chats.
 */
export async function getChatsForUser(userId: string): Promise<ChatListItem[]> {
  const rows = await db
    .select({
      id: chats.id,
      kind: chats.kind,
      name: chats.name,
      lastMessagePreview: chats.lastMessagePreview,
      lastMessageAt: chats.lastMessageAt,
      botName: bots.name,
      botAvatar: bots.avatar,
    })
    .from(chats)
    .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .innerJoin(bots, eq(bots.id, chatMembers.botId))
    .where(eq(chats.userId, userId))
    // Newest chats first. Rows of a single chat share a `lastMessageAt`, so the
    // `joinedAt` tie-break keeps each chat's bots in join order.
    .orderBy(desc(chats.lastMessageAt), asc(chatMembers.joinedAt))

  // One entry per chat; the first row also carries the chat's own fields.
  const chatsById = new Map<string, ChatListItem>()

  for (const row of rows) {
    const existing = chatsById.get(row.id)

    if (existing) {
      existing.memberAvatars.push(row.botAvatar)
      continue
    }

    chatsById.set(row.id, {
      id: row.id,
      kind: row.kind,
      title: row.name ?? row.botName,
      memberAvatars: [row.botAvatar],
      lastMessagePreview: row.lastMessagePreview,
      lastMessageAtLabel: formatChatTime(row.lastMessageAt),
    })
  }

  return [...chatsById.values()]
}

export type BotOption = {
  id: string
  name: string
  avatar: string
}

// The user's bots, oldest first, for the group-chat member picker.
export async function getBotsForUser(userId: string): Promise<BotOption[]> {
  return db
    .select({ id: bots.id, name: bots.name, avatar: bots.avatar })
    .from(bots)
    .where(eq(bots.userId, userId))
    .orderBy(asc(bots.createdAt))
}

// A compact, chat-list friendly stamp: "14:05", "Yesterday", "3 Mar".
// Rendered on the server so the string is stable across hydration.
function formatChatTime(date: Date) {
  if (isToday(date)) {
    return format(date, "HH:mm")
  }

  if (isYesterday(date)) {
    return "Yesterday"
  }

  if (isThisYear(date)) {
    return format(date, "d MMM")
  }

  return format(date, "d MMM yyyy")
}
