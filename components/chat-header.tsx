"use client"

import { useAuth } from "@clerk/nextjs"
import { MonitorIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { useDesktopPanelToggle } from "@/components/chat-resizable-layout"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import { useUpgradeToast } from "@/components/upgrade-toast"
import { SANDBOX_FEATURE } from "@/lib/billing"
import type { BotOption } from "@/queries/bots"
import type { ChatDetail } from "@/queries/chats"

type ChatHeaderProps = {
  chat: ChatDetail
  // The user's bots, for the group chat's add/remove member picker.
  bots: BotOption[]
}

function ChatHeader({ chat, bots }: ChatHeaderProps) {
  const { toggleDesktop, desktopOpen } = useDesktopPanelToggle()
  const { has } = useAuth()
  const showUpgradeToast = useUpgradeToast()
  const isGroup = chat.kind === "group"

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {isGroup ? (
        // The group's identity doubles as the trigger for its edit dialog.
        <GroupChatDialog
          bots={bots}
          chat={chat}
          trigger={
            <Button variant="ghost" className="h-auto gap-3 py-1.5 ps-1.5" />
          }
        >
          <GroupChatAvatar
            avatars={chat.members.map((member) => member.avatar)}
            className="size-8 shrink-0 rounded-lg"
          />
          <span className="truncate font-medium">{chat.name ?? "Group chat"}</span>
        </GroupChatDialog>
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
          onClick={() => {
            // Connecting to the sandbox desktop is its own billable capability.
            if (!has({ feature: SANDBOX_FEATURE })) {
              showUpgradeToast()
              return
            }
            toggleDesktop()
          }}
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
