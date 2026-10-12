"use client"

import { MonitorIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { useDesktopPanelToggle } from "@/components/chat-resizable-layout"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { Button } from "@/components/ui/button"
import type { ChatDetail } from "@/queries/chats"

type ChatHeaderProps = {
  chat: ChatDetail
}

function ChatHeader({ chat }: ChatHeaderProps) {
  const { toggleDesktop, desktopOpen } = useDesktopPanelToggle()
  const isGroup = chat.kind === "group"

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {isGroup ? (
        <div className="flex min-w-0 items-center gap-3 py-1.5 ps-1.5">
          <GroupChatAvatar
            avatars={chat.members.map((member) => member.avatar)}
            className="size-8 shrink-0 rounded-lg"
          />
          <span className="truncate font-medium">{chat.name ?? "Group chat"}</span>
        </div>
      ) : (
        // The bot's identity doubles as the trigger for its edit dialog.
        <BotDialog
          bot={chat.members[0]}
          trigger={
            <Button variant="ghost" className="h-auto gap-3 py-1.5 ps-1.5" />
          }
        >
          <ChatAvatar
            seed={chat.members[0].avatar}
            className="size-8 shrink-0 rounded-lg"
          />
          <span className="truncate font-medium">{chat.members[0].name}</span>
        </BotDialog>
      )}
      {/* Group chats have no desktop panel, so they get no toggle. */}
      {!isGroup && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-label="Toggle desktop panel"
          aria-controls="desktop"
          aria-expanded={desktopOpen}
          onClick={toggleDesktop}
        >
          <MonitorIcon data-icon="inline-start" />
          Desktop
        </Button>
      )}
    </header>
  )
}

export { ChatHeader }
export type { ChatHeaderProps }
