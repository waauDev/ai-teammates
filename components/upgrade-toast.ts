"use client"

import { useRouter } from "next/navigation"

import { toast } from "@/components/ui/toast"
import { UPGRADE_MESSAGE } from "@/lib/billing"

// The free plan's only affordance: an error toast that opens the pricing page.
export function useUpgradeToast() {
  const router = useRouter()

  return function showUpgradeToast() {
    toast.add({
      type: "error",
      title: "Upgrade required",
      description: UPGRADE_MESSAGE,
      actionProps: {
        children: "See plans",
        onClick: () => router.push("/pricing"),
      },
    })
  }
}
