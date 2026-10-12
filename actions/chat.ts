"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import {
  chat,
  defaultStorage,
  type ChatStartSessionParams,
} from "@trigger.dev/sdk/ai"

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
  if (!chat.bot.sandboxId) throw new Error("This bot has no sandbox assigned.")

  await ensureComputerUse(chat.bot.sandboxId)
  const sandbox = await getBotSandbox(chat.bot.sandboxId)
  const preview = await sandbox.getSignedPreviewUrl(6080, 3600)
  const url = new URL(preview.url)
  url.pathname = "/vnc.html"
  url.searchParams.set("autoconnect", "1")
  url.searchParams.set("resize", "scale")
  return url.toString()
}
