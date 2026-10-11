"use client"

import { UserButton } from "@clerk/nextjs"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent />
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
    </Sidebar>
  )
}
