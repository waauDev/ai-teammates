import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

export default async function PricingPage() {
  await auth.protect()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Plans</h1>
        <p className="text-sm text-muted-foreground">
          Bots and sandboxes are part of Pro. Pick a plan to get started.
        </p>
      </div>
      <PricingTable />
    </div>
  )
}
