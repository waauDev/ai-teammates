import { format, isThisYear, isToday, isYesterday } from "date-fns"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

export type ChatListItem = {
  id: string
  kind: "direct" | "group"
  // Direct chats fall back to the bot's name; group chats use their own name.
  title: string
  // Seed for the bot whose face represents the chat in the sidebar.
  botAvatar: string
  lastMessagePreview: string | null
  lastMessageAtLabel: string
}

/**
 * The chats that belong to a single Clerk user, each paired with the bot whose
 * face represents it in the sidebar.
 *
 * Every chat is scoped to `userId`, so one user can never read another user's
 * chats. Group chats are still represented by the first bot that joined them;
 * a dedicated group avatar/name is deferred for now.
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
    // `joinedAt` tie-break puts the earliest-joined bot first: the "first bot"
    // fallback used for group chats.
    .orderBy(desc(chats.lastMessageAt), asc(chatMembers.joinedAt))

  // Keep the first row per chat; it carries the representative bot.
  const chatsById = new Map<string, ChatListItem>()

  for (const row of rows) {
    if (chatsById.has(row.id)) {
      continue
    }

    chatsById.set(row.id, {
      id: row.id,
      kind: row.kind,
      title: row.name ?? row.botName,
      botAvatar: row.botAvatar,
      lastMessagePreview: row.lastMessagePreview,
      lastMessageAtLabel: formatChatTime(row.lastMessageAt),
    })
  }

  return [...chatsById.values()]
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
