import { MonitorIcon } from "lucide-react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import type { ChatBot } from "@/queries/chats"

type ChatHeaderProps = {
  bot: ChatBot
}

function ChatHeader({ bot }: ChatHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {/* The bot's identity doubles as the trigger for its edit dialog. */}
      <BotDialog
        bot={bot}
        trigger={<Button variant="ghost" className="h-auto gap-3 py-1.5 ps-1.5" />}
      >
        <ChatAvatar seed={bot.avatar} className="size-8 shrink-0 rounded-lg" />
        <span className="truncate font-medium">{bot.name}</span>
      </BotDialog>
      {/* Reserved for opening the bot's desktop. Deliberately inert for now. */}
      <Button variant="ghost" size="sm" className="ml-auto">
        <MonitorIcon data-icon="inline-start" />
        Desktop
      </Button>
    </header>
  )
}

export { ChatHeader }
export type { ChatHeaderProps }
