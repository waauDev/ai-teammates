"use server"

import { auth } from "@clerk/nextjs/server"
import { DaytonaError } from "@daytona/sdk"
import { and, eq } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { BOT_FEATURE, SANDBOX_FEATURE, UPGRADE_MESSAGE } from "@/lib/billing"
import { db } from "@/lib/db"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"
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
  const { userId, has } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to create a bot." }
  }

  // A bot comes with its sandbox, so creating one needs both capabilities. The
  // dialog also blocks this client-side; this is the trust boundary.
  if (!has({ feature: BOT_FEATURE }) || !has({ feature: SANDBOX_FEATURE })) {
    return { ok: false, error: UPGRADE_MESSAGE }
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

  // One sandbox per bot; a failure here aborts creation so no bot row exists
  // without its sandbox.
  let sandboxId: string
  try {
    sandboxId = await createBotSandbox(botId)
  } catch (error) {
    console.error("Failed to create Daytona sandbox for bot", error)
    const details =
      error instanceof DaytonaError
        ? [
            error.statusCode ? `HTTP ${error.statusCode}` : undefined,
            error.code,
            error.message,
          ]
            .filter(Boolean)
            .join(": ")
        : error instanceof Error
          ? error.message
          : "Unknown Daytona error"
    return {
      ok: false,
      error: `Couldn't create the bot's sandbox. ${details}`,
    }
  }

  let bot: Bot
  let chat: Chat
  try {
    ;[[bot], [chat]] = await db.batch([
      db
        .insert(bots)
        .values({ id: botId, sandboxId, ...parsed.data, userId })
        .returning(),
      // A direct chat with the new bot; `name` stays null so the UI falls back to
      // the bot's name.
      db.insert(chats).values({ id: chatId, userId, kind: "direct" }).returning(),
      db.insert(chatMembers).values({ chatId, botId }),
    ])
  } catch {
    // Don't leave a billable sandbox behind if the DB write failed.
    await deleteBotSandbox(sandboxId).catch(() => {})
    return { ok: false, error: "Couldn't save the bot." }
  }

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

  const [bot] = await db
    .select()
    .from(bots)
    .where(and(eq(bots.id, id), eq(bots.userId, userId)))
    .limit(1)

  if (!bot) {
    return { ok: false, error: "That bot no longer exists." }
  }

  // Delete the sandbox before the row so a failure leaves the bot (and its
  // sandboxId) intact instead of orphaning a billable sandbox.
  if (bot.sandboxId) {
    try {
      await deleteBotSandbox(bot.sandboxId)
    } catch {
      return { ok: false, error: "Couldn't remove the bot's sandbox." }
    }
  }

  // Deleting the bot cascades its chat memberships, which drops its chat out of
  // every query. shortcut: the chat row itself is left behind, unreachable;
  // delete it too if a chat ever needs to outlive its bots.
  await db.delete(bots).where(and(eq(bots.id, id), eq(bots.userId, userId)))

  revalidatePath("/", "layout")

  return { ok: true }
}
