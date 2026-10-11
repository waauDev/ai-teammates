import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { ChatHeader } from "@/components/chat-header"
import { getChatForUser } from "@/queries/chats"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = await params
  // Protects the page and yields the signed-in user in one call.
  const { userId } = await auth.protect()

  const chat = await getChatForUser(userId, chatId)

  if (!chat) {
    notFound()
  }

  return <ChatHeader bot={chat.bot} />
}
