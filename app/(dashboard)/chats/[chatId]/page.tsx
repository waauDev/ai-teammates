import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { Chat } from "@/components/chat"
import { ChatHeader } from "@/components/chat-header"
import { ChatResizableLayout } from "@/components/chat-resizable-layout"
import { getBotsForUser } from "@/queries/bots"
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

  // Only the group header's edit dialog needs the full bot list.
  const bots = chat.kind === "group" ? await getBotsForUser(userId) : []

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden md:h-[calc(100svh-1rem)]">
      <ChatResizableLayout chatId={chatId}>
        <ChatHeader chat={chat} bots={bots} />
        <Chat chatId={chatId} kind={chat.kind} members={chat.members} />
      </ChatResizableLayout>
    </main>
  )
}
