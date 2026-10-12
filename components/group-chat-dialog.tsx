"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { createGroupChat } from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { BotOption } from "@/queries/bots"

const groupChatFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the group a name.")
    .max(50, "Keep the name under 50 characters."),
  memberIds: z.array(z.string()).min(2, "Pick at least two bots."),
})

type GroupChatFormValues = z.infer<typeof groupChatFormSchema>

const emptyValues: GroupChatFormValues = { name: "", memberIds: [] }

type GroupChatDialogProps = {
  bots: BotOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GroupChatDialog({ bots, open, onOpenChange }: GroupChatDialogProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<GroupChatFormValues>({
    resolver: zodResolver(groupChatFormSchema),
    defaultValues: emptyValues,
  })

  function handleOpenChange(next: boolean) {
    if (isPending) {
      return
    }

    onOpenChange(next)
    setServerError(null)

    // Re-seed on open so a cancelled draft never lingers.
    if (next) {
      form.reset(emptyValues)
    }
  }

  function onSubmit(values: GroupChatFormValues) {
    setServerError(null)

    startTransition(async () => {
      const result = await createGroupChat(values)

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      form.reset(emptyValues)
      onOpenChange(false)
      router.push(`/chats/${result.chat.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New group chat</DialogTitle>
          <DialogDescription>
            Name the group and pick the bots that join it.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="group-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="group-name"
                    placeholder="Launch team"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="memberIds"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldTitle>Bots</FieldTitle>
                  {bots.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Create a bot first to start a group chat.
                    </p>
                  ) : (
                    <div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
                      {bots.map((bot) => {
                        const checked = field.value.includes(bot.id)

                        return (
                          <label
                            key={bot.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                field.onChange(
                                  checked
                                    ? field.value.filter((id) => id !== bot.id)
                                    : [...field.value, bot.id]
                                )
                              }
                            />
                            <ChatAvatar
                              seed={bot.avatar}
                              className="size-6 rounded-md"
                            />
                            <span className="truncate">{bot.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {serverError && <FieldError errors={[{ message: serverError }]} />}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || bots.length < 2}>
              {isPending && <Spinner />}
              Create group chat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { GroupChatDialog }
export type { GroupChatDialogProps }
