"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { db } from "@/lib/db"
import {
  bots,
  chatMembers,
  chats,
  createBotSchema,
  updateBotSchema,
  type Bot,
  type Chat,
  type CreateBotInput,
  type UpdateBotInput,
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

export type UpdateBotResult =
  { ok: true; bot: Bot } | { ok: false; error: string }

export async function updateBot(
  input: UpdateBotInput
): Promise<UpdateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to edit a bot." }
  }

  const parsed = updateBotSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: "Some details need another look." }
  }

  const { id, ...values } = parsed.data

  // Scoping the update to `userId` keeps a forged id from reaching another
  // user's bot. An empty instruction field clears the column, but drizzle skips
  // `undefined` in a set clause, so normalise it to null.
  const [bot] = await db
    .update(bots)
    .set({ ...values, instructions: values.instructions?.trim() || null })
    .where(and(eq(bots.id, id), eq(bots.userId, userId)))
    .returning()

  if (!bot) {
    return { ok: false, error: "That bot no longer exists." }
  }

  // The bot's name shows up in the sidebar chat list and the chat header.
  revalidatePath("/", "layout")

  return { ok: true, bot }
}

export type DeleteBotResult = { ok: true } | { ok: false; error: string }

export async function deleteBot(id: string): Promise<DeleteBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to delete a bot." }
  }

  // Deleting the bot cascades its chat memberships, which drops its chat out of
  // every query. shortcut: the chat row itself is left behind, unreachable;
  // delete it too if a chat ever needs to outlive its bots.
  const [bot] = await db
    .delete(bots)
    .where(and(eq(bots.id, id), eq(bots.userId, userId)))
    .returning()

  if (!bot) {
    return { ok: false, error: "That bot no longer exists." }
  }

  revalidatePath("/", "layout")

  return { ok: true }
}
