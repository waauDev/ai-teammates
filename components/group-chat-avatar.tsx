import { cn } from "cn"

import { ChatAvatar } from "@/components/chat-avatar"

type GroupChatAvatarProps = {
  // Seeds for the chat's bots, in join order. A single seed renders as a plain
  // chat avatar, so this is a drop-in replacement wherever one bot's face was
  // shown.
  avatars: string[]
  className?: string
}

// A square that holds the chat's faces. Its size comes from `className`, so it
// takes up exactly the space a single `ChatAvatar` would.
function GroupChatAvatar({ avatars, className }: GroupChatAvatarProps) {
  if (avatars.length <= 1) {
    return <ChatAvatar seed={avatars[0] ?? ""} className={className} />
  }

  const frame = cn("relative shrink-0 @container", className)
  const face = "absolute rounded-full ring-2 ring-sidebar"

  if (avatars.length === 2) {
    return (
      <div className={frame}>
        <ChatAvatar
          seed={avatars[0]}
          className={cn(face, "top-0 left-0 size-[58%]")}
        />
        <ChatAvatar
          seed={avatars[1]}
          className={cn(face, "right-0 bottom-0 size-[58%]")}
        />
      </div>
    )
  }

  if (avatars.length === 3) {
    return (
      <div className={frame}>
        <ChatAvatar
          seed={avatars[0]}
          className={cn(face, "top-0 left-1/2 size-[54%] -translate-x-1/2")}
        />
        <ChatAvatar
          seed={avatars[1]}
          className={cn(face, "bottom-0 left-0 size-[54%]")}
        />
        <ChatAvatar
          seed={avatars[2]}
          className={cn(face, "right-0 bottom-0 size-[54%]")}
        />
      </div>
    )
  }

  // Four or more: three faces plus a "+N" count fill a 2x2 grid.
  return (
    <div className={frame}>
      <div className="grid size-full grid-cols-2 grid-rows-2 gap-[6%]">
        {avatars.slice(0, 3).map((seed, index) => (
          <ChatAvatar
            key={`${seed}-${index}`}
            seed={seed}
            className="size-full rounded-full ring-2 ring-background"
          />
        ))}
        <span className="grid size-full place-items-center rounded-full bg-muted font-medium text-[38cqw] text-muted-foreground leading-none">
          +{avatars.length - 3}
        </span>
      </div>
    </div>
  )
}

export { GroupChatAvatar }
export type { GroupChatAvatarProps }
