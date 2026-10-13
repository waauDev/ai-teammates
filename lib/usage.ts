import { clerkClient } from "@clerk/nextjs/server"
import { and, eq, gte, lt, sql } from "drizzle-orm"
import { nanoid } from "nanoid"

import { db } from "@/lib/db"
import {
  bots,
  usageLedger,
  usagePeriods,
  userSandboxUsage,
} from "@/lib/db/schema"

export const MAX_SANDBOXES = 3
export const AI_BUDGET_MICROS = 10_000_000
export const AI_BUDGET_DOLLARS = AI_BUDGET_MICROS / 1_000_000
export const MAX_MODEL_STEPS = 5
export const MAX_OUTPUT_TOKENS_PER_STEP = 4096

export async function getSubscriptionPeriod(userId: string) {
  const client = await clerkClient()
  const subscription = await client.billing.getUserBillingSubscription(userId)
  if (subscription.status !== "active") return null

  const item = subscription.subscriptionItems.find(
    (candidate) =>
      candidate.status === "active" &&
      candidate.periodEnd !== null &&
      candidate.periodEnd > Date.now()
  )
  if (!item?.periodEnd) return null

  return {
    start: new Date(item.periodStart),
    end: new Date(item.periodEnd),
  }
}

export async function reserveSandboxSlot(userId: string): Promise<boolean> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bots)
    .where(eq(bots.userId, userId))

  if (Number(count) >= MAX_SANDBOXES) return false

  const [slot] = await db
    .insert(userSandboxUsage)
    .values({ userId, activeSandboxes: Number(count) + 1 })
    .onConflictDoUpdate({
      target: userSandboxUsage.userId,
      set: {
        activeSandboxes: sql`${userSandboxUsage.activeSandboxes} + 1`,
      },
      setWhere: lt(userSandboxUsage.activeSandboxes, MAX_SANDBOXES),
    })
    .returning({ userId: userSandboxUsage.userId })

  return Boolean(slot)
}

export async function releaseSandboxSlot(userId: string) {
  await db
    .update(userSandboxUsage)
    .set({
      activeSandboxes: sql`greatest(${userSandboxUsage.activeSandboxes} - 1, 0)`,
    })
    .where(eq(userSandboxUsage.userId, userId))
}

function estimateMaxRunCostMicros(messages: unknown[], system: string): number {
  // Reserve against the expensive long-context price and every permitted step.
  // One UTF-8 byte is budgeted as one input token, a conservative upper bound.
  const inputBytes = Buffer.byteLength(
    JSON.stringify({ messages, system }),
    "utf8"
  )
  const inputMicros = (inputBytes + 20_000) * MAX_MODEL_STEPS * 10
  const outputMicros = MAX_MODEL_STEPS * MAX_OUTPUT_TOKENS_PER_STEP * 38
  return Math.ceil(inputMicros + outputMicros)
}

export async function reserveAiUsage(
  userId: string,
  period: { start: Date; end: Date },
  messages: unknown[],
  system: string
) {
  const reservedMicros = estimateMaxRunCostMicros(messages, system)
  const [reservation] = await db
    .insert(usagePeriods)
    .values({
      userId,
      periodStart: period.start,
      periodEnd: period.end,
      reservedMicros,
    })
    .onConflictDoUpdate({
      target: [usagePeriods.userId, usagePeriods.periodStart],
      set: {
        periodEnd: period.end,
        reservedMicros: sql`${usagePeriods.reservedMicros} + ${reservedMicros}`,
      },
      setWhere: lt(
        sql`${usagePeriods.aiCostMicros} + ${usagePeriods.reservedMicros} + ${reservedMicros}`,
        AI_BUDGET_MICROS
      ),
    })
    .returning({ userId: usagePeriods.userId })

  if (!reservation) return null
  return { reservedMicros }
}

export async function settleAiUsage(
  userId: string,
  period: { start: Date; end: Date },
  reservation: { reservedMicros: number },
  inputTokens: number,
  outputTokens: number
) {
  // Use long-context gpt-6-astra rates ($10/$37.50 per 1M) as a safety margin.
  const costMicros = Math.ceil(inputTokens * 10 + outputTokens * 38)
  const id = nanoid()

  await db.batch([
    db
      .update(usagePeriods)
      .set({
        aiCostMicros: sql`${usagePeriods.aiCostMicros} + ${costMicros}`,
        reservedMicros: sql`${usagePeriods.reservedMicros} - ${reservation.reservedMicros}`,
        inputTokens: sql`${usagePeriods.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${usagePeriods.outputTokens} + ${outputTokens}`,
      })
      .where(
        and(
          eq(usagePeriods.userId, userId),
          eq(usagePeriods.periodStart, period.start),
          gte(usagePeriods.reservedMicros, reservation.reservedMicros)
        )
      ),
    db.insert(usageLedger).values({
      id,
      userId,
      periodStart: period.start,
      inputTokens,
      outputTokens,
      costMicros,
    }),
  ])
}

export async function releaseAiReservation(
  userId: string,
  periodStart: Date,
  reservation: { reservedMicros: number }
) {
  await db
    .update(usagePeriods)
    .set({
      reservedMicros: sql`greatest(${usagePeriods.reservedMicros} - ${reservation.reservedMicros}, 0)`,
    })
    .where(
      and(
        eq(usagePeriods.userId, userId),
        eq(usagePeriods.periodStart, periodStart)
      )
    )
}
