"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { usePanelRef } from "react-resizable-panels"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { DaytonaVncPreview } from "@/components/daytona-vnc-preview"

const DesktopPanelContext = createContext({
  toggleDesktop: () => {},
  desktopOpen: false,
})

function useDesktopPanelToggle() {
  return useContext(DesktopPanelContext)
}

function ChatResizableLayout({
  chatId,
  children,
}: {
  chatId: string
  children: React.ReactNode
}) {
  const desktopPanelRef = usePanelRef()
  const [desktopOpen, setDesktopOpen] = useState(false)
  const toggleDesktop = useCallback(() => {
    const panel = desktopPanelRef.current
    if (!panel) return

    if (panel.isCollapsed()) {
      panel.expand()
    } else {
      panel.collapse()
    }
  }, [desktopPanelRef])

  return (
    <DesktopPanelContext.Provider value={{ toggleDesktop, desktopOpen }}>
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 min-w-0 flex-1"
        onLayoutChange={(layout) => setDesktopOpen((layout.desktop ?? 0) > 0)}
      >
        <ResizablePanel id="chat" defaultSize="100%" minSize="40%">
          <div className="flex h-full min-h-0 min-w-0 flex-col">{children}</div>
        </ResizablePanel>
        {desktopOpen && <ResizableHandle withHandle />}
        <ResizablePanel
          id="desktop"
          panelRef={desktopPanelRef}
          collapsible
          collapsedSize="0%"
          defaultSize="0%"
          minSize="20%"
          maxSize="60%"
          aria-label="Desktop panel"
        >
          <DaytonaVncPreview chatId={chatId} enabled={desktopOpen} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </DesktopPanelContext.Provider>
  )
}

export { ChatResizableLayout, useDesktopPanelToggle }
