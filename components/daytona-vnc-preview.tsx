"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { XIcon } from "lucide-react"

import { getChatVncPreviewUrl } from "@/actions/chat"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function DaytonaVncPreview({
  chatId,
  enabled,
}: {
  chatId: string
  enabled: boolean
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const previewRequestRef = useRef<Promise<string> | null>(null)
  const previewHostRef = useRef<HTMLDivElement>(null)
  const dialogHostRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const iframeUrlRef = useRef<string | null>(null)
  const previewButtonRef = useRef<HTMLButtonElement>(null)
  const cleanupTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || previewUrl || loadError) return

    let active = true
    const request =
      (previewRequestRef.current ??= getChatVncPreviewUrl(chatId))
    request
      .then((url) => {
        if (active) setPreviewUrl(url)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })

    return () => {
      active = false
    }
  }, [chatId, enabled, loadError, previewUrl])

  useLayoutEffect(() => {
    if (!previewUrl) return

    let iframe = iframeRef.current
    if (!iframe) {
      iframe = document.createElement("iframe")
      iframe.title = "Daytona sandbox desktop"
      iframe.tabIndex = 0
      iframe.allow = "clipboard-read; clipboard-write"
      iframe.className = "size-full border-0 bg-black"
      iframe.src = previewUrl
      iframeRef.current = iframe
      iframeUrlRef.current = previewUrl
    } else if (iframeUrlRef.current !== previewUrl) {
      iframe.src = previewUrl
      iframeUrlRef.current = previewUrl
    }

    const host = fullscreen ? dialogHostRef.current : previewHostRef.current
    if (host) {
      host.appendChild(iframe)
      if (fullscreen) iframe.focus({ preventScroll: true })
    }
  }, [fullscreen, previewUrl])

  useEffect(() => {
    if (cleanupTimeoutRef.current !== null) {
      window.clearTimeout(cleanupTimeoutRef.current)
      cleanupTimeoutRef.current = null
    }

    return () => {
      const iframe = iframeRef.current
      if (!iframe) return
      cleanupTimeoutRef.current = window.setTimeout(() => {
        iframe.remove()
        iframeRef.current = null
        iframeUrlRef.current = null
        cleanupTimeoutRef.current = null
      }, 0)
    }
  }, [])

  return (
    <Dialog
      open={fullscreen}
      onOpenChange={(open, details) => {
        if (open || details.reason === "close-press") setFullscreen(open)
      }}
    >
      <div className="relative flex h-full min-h-0 w-full items-start justify-start overflow-hidden bg-black">
        <div ref={previewHostRef} className="size-full self-start" />
        {!previewUrl && !loadError && (
          <div className="absolute inset-x-0 top-0 grid place-items-center pt-4 text-sm text-muted-foreground">
            Connecting to desktop…
          </div>
        )}
        {loadError && (
          <div className="absolute inset-x-0 top-0 grid place-items-center p-4 pt-4 text-center text-sm text-muted-foreground">
            Could not connect to the sandbox desktop.
          </div>
        )}
        <button
          ref={previewButtonRef}
          type="button"
          aria-label="Open sandbox desktop fullscreen"
          className="absolute inset-0 z-10 cursor-zoom-in"
          onClick={() => setFullscreen(true)}
          disabled={!previewUrl}
        />
      </div>

      <DialogContent
        keepMounted
        showCloseButton={false}
        initialFocus={false}
        finalFocus={previewButtonRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        className="h-dvh w-screen max-w-none grid-rows-[auto_minmax(0,1fr)] gap-2 rounded-none p-3 sm:max-w-none"
      >
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle>Sandbox desktop</DialogTitle>
          <DialogClose
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Close desktop" />
            }
          >
            <XIcon />
          </DialogClose>
        </DialogHeader>
        <div
          ref={dialogHostRef}
          className="min-h-0 overflow-hidden rounded-md bg-black"
        />
      </DialogContent>
    </Dialog>
  )
}

export { DaytonaVncPreview }
