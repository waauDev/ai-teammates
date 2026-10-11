"use client"

import { UserButton } from "@clerk/nextjs"
import { BotIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
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
  SidebarRail,
} from "@/components/ui/sidebar"
import type { ChatListItem } from "@/queries/bots"

type AppSidebarProps = {
  chats: ChatListItem[]
}

export function AppSidebar({ chats }: AppSidebarProps) {
  const [botOpen, setBotOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  // Chat route is /chats/{id}; highlight the chat it points at.
  const activeChatId =
    pathname.startsWith("/chats/") ? pathname.split("/")[2] : undefined

  // ⌘K / Ctrl+K opens the search palette, the shadcn CommandDialog shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Sidebar collapsible="icon">
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
        <Button
          variant="ghost"
          onClick={() => setSearchOpen(true)}
          // Mirrors Input's default classes so the trigger reads as a search
          // field, while keeping the button's own hover state.
          className="h-8 w-full min-w-0 justify-start rounded-lg border border-input bg-transparent px-2.5 py-1 text-base font-normal text-muted-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
        >
          <SearchIcon className="opacity-50" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            Search
          </span>
          <Kbd
            data-icon="inline-end"
            className="ml-auto group-data-[collapsible=icon]:hidden"
          >
            ⌘K
          </Kbd>
        </Button>
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
                    tooltip={chat.title}
                    isActive={chat.id === activeChatId}
                    // Icon mode swaps the padded, two-line row for a square
                    // button the avatar fills, so the text is dropped entirely.
                    className="h-auto group-data-[collapsible=icon]:p-0!"
                  >
                    <ChatAvatar
                      seed={chat.botAvatar}
                      className="size-8 shrink-0 rounded-lg"
                    />
                    <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-medium">{chat.title}</span>
                      <span className="truncate text-xs text-sidebar-foreground/70">
                        {chat.lastMessagePreview}
                      </span>
                    </div>
                    <span className="ml-auto shrink-0 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
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
                        "flex !w-full min-w-0 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm text-current outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>span:last-child]:truncate",
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
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search chats"
        description="Search your chats"
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <CommandGroup heading="Chats">
              {chats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  onSelect={() => {
                    setSearchOpen(false)
                    router.push(`/chats/${chat.id}`)
                  }}
                >
                  <ChatAvatar
                    seed={chat.botAvatar}
                    className="size-6 shrink-0 rounded-md"
                  />
                  <span className="truncate">{chat.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <SidebarRail />
    </Sidebar>
  )
}
