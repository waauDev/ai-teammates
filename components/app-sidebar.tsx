"use client"

import { UserButton } from "@clerk/nextjs"
import { BotIcon, PlusIcon, UsersIcon } from "lucide-react"
import { useState } from "react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { ChatListItem } from "@/queries/bots"

type AppSidebarProps = {
  chats: ChatListItem[]
}

export function AppSidebar({ chats }: AppSidebarProps) {
  const [botOpen, setBotOpen] = useState(false)

  return (
    <Sidebar>
      <SidebarHeader className="items-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Create"
                // Ghost triggers normally keep a muted background while the menu
                // is open (aria-expanded). Keep the "+" flat and only show a
                // background on hover.
                className="aria-expanded:bg-transparent"
              />
            }
          >
            <PlusIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setBotOpen(true)}>
                <BotIcon />
                Create a new bot
              </DropdownMenuItem>
              <DropdownMenuItem>
                <UsersIcon />
                Create a group chat
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton
                    render={<a href={`/chats/${chat.id}`} />}
                    className="h-auto"
                  >
                    <ChatAvatar
                      seed={chat.botAvatar}
                      className="size-8 shrink-0 rounded-lg"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{chat.title}</span>
                      <span className="truncate text-xs text-sidebar-foreground/70">
                        {chat.lastMessagePreview}
                      </span>
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-sidebar-foreground/70">
                      {chat.lastMessageAtLabel}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem className="w-full">
            <SidebarMenuButton
              size="lg"
              render={
                <UserButton
                  showName
                  appearance={{
                    elements: {
                      // Clerk's UserButton renders through an "invisible root box" that
                      // writes its classes onto its parent element (the SidebarMenuItem
                      // <li>). That is where the menu-item chrome belongs: fill the row
                      // and mirror a regular sidebar menu button's hover/text treatment.
                      rootBox:
                        "flex !w-full min-w-0 rounded-md text-sidebar-foreground transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      // The trigger is the transparent, full-area hit target that fills
                      // the menu item; its colour is inherited from the root box above.
                      userButtonTrigger:
                        "flex !w-full min-w-0 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-current outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate",
                      userButtonBox: "flex !w-full min-w-0 items-center gap-2",
                      // Remove Clerk's inline-start padding and let gap-2 space things.
                      // `text-current` makes the name inherit the trigger's (hover) color.
                      userButtonOuterIdentifier:
                        "min-w-0 truncate ps-0 text-sm font-medium text-current",
                      // Clerk renders the name first and the avatar second; order-first
                      // puts the avatar on the left. 1.5rem, like the rest of the sidebar.
                      avatarBox: "order-first size-6",
                    },
                  }}
                />
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <BotDialog open={botOpen} onOpenChange={setBotOpen} />
    </Sidebar>
  )
}
