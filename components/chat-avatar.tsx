import { Avatar as DiceBearAvatar, Style } from "@dicebear/core"
import gaze from "@dicebear/styles/gaze.json" with { type: "json" }
import Image from "next/image"

const gazeStyle = new Style(gaze)

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
}

function ChatAvatar({ seed, animated = false, className }: ChatAvatarProps) {
  const src = new DiceBearAvatar(gazeStyle, {
    seed,
    size: 64,
    animationVariant: animated ? ["medium"] : ["none"],
  }).toDataUri()

  return <Image src={src} alt="" width={32} height={32} className={className} />
}

export { ChatAvatar }
export type { ChatAvatarProps }
