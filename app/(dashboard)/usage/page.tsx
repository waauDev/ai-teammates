import { auth, clerkClient } from "@clerk/nextjs/server"
import { and, eq, sql } from "drizzle-orm"
import { redirect } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { AI_BUDGET_DOLLARS, MAX_SANDBOXES } from "@/lib/usage"
import { db } from "@/lib/db"
import { bots, usagePeriods } from "@/lib/db/schema"

function timeUntilReset(end: Date) {
  const remaining = Math.max(0, end.getTime() - Date.now())
  const days = Math.floor(remaining / 86_400_000)
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default async function UsagePage() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const client = await clerkClient()
  const subscription = await client.billing.getUserBillingSubscription(userId)
  const currentItem =
    subscription.status === "active"
      ? subscription.subscriptionItems.find(
          (item) => item.status === "active" && item.periodEnd !== null
        )
      : undefined
  const periodStart = currentItem?.periodStart
    ? new Date(currentItem.periodStart)
    : null
  const periodEnd = currentItem?.periodEnd
    ? new Date(currentItem.periodEnd)
    : null

  const [botRows, usageRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bots)
      .where(eq(bots.userId, userId)),
    periodStart
      ? db
          .select()
          .from(usagePeriods)
          .where(
            and(
              eq(usagePeriods.userId, userId),
              eq(usagePeriods.periodStart, periodStart)
            )
          )
          .limit(1)
      : Promise.resolve([]),
  ])

  const botCount = botRows[0]
  const usage = usageRows[0]
  const sandboxes = Number(botCount?.count ?? 0)
  const costMicros = usage?.aiCostMicros ?? 0
  const reservedMicros = usage?.reservedMicros ?? 0
  const aiDollars = (costMicros + reservedMicros) / 1_000_000
  const sandboxPercent = Math.min(100, (sandboxes / MAX_SANDBOXES) * 100)
  const aiPercent = Math.min(100, (aiDollars / AI_BUDGET_DOLLARS) * 100)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground">
          Resource limits and estimated AI usage for your current plan.
        </p>
      </header>

      <p className="text-sm text-muted-foreground">
        {periodEnd
          ? `Usage resets in ${timeUntilReset(periodEnd)} (${periodEnd.toLocaleString()}).`
          : "There is no active subscription period. Usage limits reset when a paid subscription becomes active."}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daytona sandboxes</CardTitle>
            <CardDescription>
              Each sandbox uses Daytona’s default allocation: 1 vCPU, 1 GiB RAM,
              and 3 GiB disk.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">Active sandboxes</span>
              <span className="text-muted-foreground tabular-nums">
                {sandboxes} / {MAX_SANDBOXES}
              </span>
            </div>
            <Progress value={sandboxPercent} aria-label="Sandbox usage" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimated AI cost</CardTitle>
            <CardDescription>
              Provider-reported gpt-6-astra tokens, estimated at conservative
              long-context rates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">Current period</span>
              <span className="text-muted-foreground tabular-nums">
                ${aiDollars.toFixed(2)} / ${AI_BUDGET_DOLLARS.toFixed(2)}
              </span>
            </div>
            <Progress value={aiPercent} aria-label="AI cost usage" />
            <p className="mt-3 text-xs text-muted-foreground">
              {usage?.inputTokens.toLocaleString() ?? "0"} input tokens /{" "}
              {usage?.outputTokens.toLocaleString() ?? "0"} output tokens
              {reservedMicros > 0 &&
                ` / $${(reservedMicros / 1_000_000).toFixed(2)} in progress`}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
