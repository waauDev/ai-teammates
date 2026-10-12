import { auth } from "@clerk/nextjs/server"
import { cookies } from "next/headers"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getBotsForUser, getChatsForUser } from "@/queries/bots"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { userId } = await auth()
  const chats = userId ? await getChatsForUser(userId) : []
  const bots = userId ? await getBotsForUser(userId) : []
  // SidebarProvider writes this cookie on every toggle; read it so the state
  // survives reloads. No cookie (first visit) keeps the default, expanded.
  const defaultOpen =
    (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar chats={chats} bots={bots} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
