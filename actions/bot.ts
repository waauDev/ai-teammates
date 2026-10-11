"use server"

import { auth } from "@clerk/nextjs/server"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { db } from "@/lib/db"
import {
  bots,
  chatMembers,
  chats,
  createBotSchema,
  type Bot,
  type Chat,
  type CreateBotInput,
} from "@/lib/db/schema"

export type CreateBotResult =
  { ok: true; bot: Bot; chat: Chat } | { ok: false; error: string }

export async function createBot(
  input: CreateBotInput
): Promise<CreateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to create a bot." }
  }

  const parsed = createBotSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: "Some details need another look." }
  }

  // Generate the ids up front so all three inserts can go out as a single
  // atomic batch. The Neon HTTP driver has no interactive transactions, and a
  // batch can't read a value returned by an earlier statement.
  const botId = nanoid()
  const chatId = nanoid()

  const [[bot], [chat]] = await db.batch([
    db
      .insert(bots)
      .values({ id: botId, ...parsed.data, userId })
      .returning(),
    // A direct chat with the new bot; `name` stays null so the UI falls back to
    // the bot's name.
    db.insert(chats).values({ id: chatId, userId, kind: "direct" }).returning(),
    db.insert(chatMembers).values({ chatId, botId }),
  ])

  // The sidebar chat list lives in the (dashboard) layout, so revalidate the
  // layout scope: page scope would leave the sidebar's cached list untouched.
  revalidatePath("/", "layout")

  return { ok: true, bot, chat }
}
