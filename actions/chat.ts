"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { db } from "@/lib/db"
import {
  bots,
  chatMembers,
  chats,
  createGroupChatSchema,
  updateGroupChatSchema,
  type Chat,
  type CreateGroupChatInput,
  type UpdateGroupChatInput,
} from "@/lib/db/schema"
import { ensureComputerUse, getBotSandbox } from "@/lib/daytona"
import { getChatForUser } from "@/queries/chats"
import type { chatAgent } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof chatAgent>("chat")
const loadTranscript = chat.createLoadTranscriptAction(defaultStorage, { limit: 50 })

// Every helper is a public endpoint: reject a chatId the signed-in user doesn't own.
async function assertOwnsChat(userId: string | null, chatId: string) {
  if (!userId || !(await getChatForUser(userId, chatId))) {
    throw new Error("Unauthorized")
  }
}

// Creates the session + first run and returns a session-scoped token.
// Idempotent on (environment, chatId).
export async function startChatSession(params: ChatStartSessionParams<typeof chatAgent>) {
  await assertOwnsChat((await auth()).userId, params.chatId)
  return startSession(params)
}

// Pure mint. The transport calls this on a 401/403 to refresh an expired token.
export async function mintChatAccessToken(chatId: string) {
  await assertOwnsChat((await auth()).userId, chatId)
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

// Reads the transcript back so a page reload restores history.
export async function loadChatTranscript(params: { chatId: string; limit?: number }) {
  await assertOwnsChat((await auth()).userId, params.chatId)
  return loadTranscript(params)
}

export async function getChatVncPreviewUrl(chatId: string) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const chat = await getChatForUser(userId, chatId)
  if (!chat) throw new Error("Unauthorized")
  // Group chats have no desktop panel.
  if (chat.kind !== "direct") throw new Error("This chat has no desktop.")

  const sandboxId = chat.members[0]?.sandboxId
  if (!sandboxId) throw new Error("This bot has no sandbox assigned.")

  await ensureComputerUse(sandboxId)
  const sandbox = await getBotSandbox(sandboxId)
  const preview = await sandbox.getSignedPreviewUrl(6080, 3600)
  const url = new URL(preview.url)
  url.pathname = "/vnc.html"
  url.searchParams.set("autoconnect", "1")
  url.searchParams.set("resize", "scale")
  return url.toString()
}

export type CreateGroupChatResult =
  | { ok: true; chat: Chat }
  | { ok: false; error: string }

export async function createGroupChat(
  input: CreateGroupChatInput
): Promise<CreateGroupChatResult> {
  const { userId } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to create a group chat." }
  }

  const parsed = createGroupChatSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: "Some details need another look." }
  }

  const { name, memberIds } = parsed.data

  // `chats.name` is nullable, so a null one slips past the schema; a group needs
  // a name (the form always supplies one).
  if (!name) {
    return { ok: false, error: "Give the group a name." }
  }

  // Only the user's own bots may join; a forged id matches no row.
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, memberIds)))

  if (owned.length !== memberIds.length) {
    return { ok: false, error: "Pick bots that belong to you." }
  }

  const chatId = nanoid()

  const [[chat]] = await db.batch([
    db
      .insert(chats)
      .values({ id: chatId, userId, kind: "group", name })
      .returning(),
    db.insert(chatMembers).values(
      // Offsetting joinedAt preserves the picked order: the first bot is the
      // chat's default and leads the stacked avatar.
      memberIds.map((botId, index) => ({
        chatId,
        botId,
        joinedAt: new Date(Date.now() + index),
      }))
    ),
  ])

  // The sidebar chat list lives in the (dashboard) layout, so revalidate the
  // layout scope: page scope would leave the sidebar's cached list untouched.
  revalidatePath("/", "layout")

  return { ok: true, chat }
}

export type UpdateGroupChatResult = { ok: true } | { ok: false; error: string }

export async function updateGroupChat(
  input: UpdateGroupChatInput
): Promise<UpdateGroupChatResult> {
  const { userId } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to edit a group chat." }
  }

  const parsed = updateGroupChatSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: "Some details need another look." }
  }

  const { id, name, memberIds } = parsed.data

  // Scoping the lookup to `userId` keeps a forged id off another user's chat;
  // the `kind` check keeps this action off a direct chat.
  const chat = await getChatForUser(userId, id)

  if (!chat || chat.kind !== "group") {
    return { ok: false, error: "That group chat no longer exists." }
  }

  // Only the user's own bots may join; a forged id matches no row.
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(eq(bots.userId, userId), inArray(bots.id, memberIds)))

  if (owned.length !== memberIds.length) {
    return { ok: false, error: "Pick bots that belong to you." }
  }

  await db.batch([
    db
      .update(chats)
      .set({ name })
      .where(and(eq(chats.id, id), eq(chats.userId, userId))),
    // Replace the roster wholesale: the picked order becomes the new join
    // order, so the first bot stays the chat's default.
    db.delete(chatMembers).where(eq(chatMembers.chatId, id)),
    db.insert(chatMembers).values(
      memberIds.map((botId, index) => ({
        chatId: id,
        botId,
        joinedAt: new Date(Date.now() + index),
      }))
    ),
  ])

  // The sidebar chat list and the chat header both live in the layout scope.
  revalidatePath("/", "layout")

  return { ok: true }
}

export type DeleteGroupChatResult = { ok: true } | { ok: false; error: string }

export async function deleteGroupChat(
  id: string
): Promise<DeleteGroupChatResult> {
  const { userId } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to delete a group chat." }
  }

  // Deleting the chat cascades its memberships. shortcut: the Trigger.dev
  // session and transcript are left behind, unreachable; delete them too if a
  // group chat ever needs a clean teardown.
  const [chat] = await db
    .delete(chats)
    .where(
      and(eq(chats.id, id), eq(chats.userId, userId), eq(chats.kind, "group"))
    )
    .returning()

  if (!chat) {
    return { ok: false, error: "That group chat no longer exists." }
  }

  revalidatePath("/", "layout")

  return { ok: true }
}
