"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { db } from "@/lib/db"
import {
  bots,
  createBotSchema,
  type Bot,
  type CreateBotInput,
} from "@/lib/db/schema"

export type CreateBotResult =
  { ok: true; bot: Bot } | { ok: false; error: string }

export async function createBot(
  input: CreateBotInput
): Promise<CreateBotResult> {
  const { userId } = await auth()

  if (!userId) {
    return { ok: false, error: "You must be signed in to create a bot." }
  }

  const parsed = createBotSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: "Some details need another look." }
  }

  const [bot] = await db
    .insert(bots)
    .values({ ...parsed.data, userId })
    .returning()

  revalidatePath("/")

  return { ok: true, bot }
}
