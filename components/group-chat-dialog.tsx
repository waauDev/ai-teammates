"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import type { ReactElement, ReactNode } from "react"
import { useState, useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import {
  createGroupChat,
  deleteGroupChat,
  updateGroupChat,
} from "@/actions/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { ChatDetail } from "@/queries/chats"

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

// The form starts from the group being edited, or blank when creating one.
function initialValues(chat?: ChatDetail): GroupChatFormValues {
  return chat
    ? {
        name: chat.name ?? "",
        memberIds: chat.members.map((member) => member.id),
      }
    : emptyValues
}

type GroupChatDialogProps = {
  bots: BotOption[]
  // When set, the dialog edits this group chat instead of creating one.
  chat?: ChatDetail
  // The trigger button rendered in uncontrolled mode; `children` is its label.
  trigger?: ReactElement
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function GroupChatDialog({
  bots,
  chat,
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
}: GroupChatDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<GroupChatFormValues>({
    resolver: zodResolver(groupChatFormSchema),
    defaultValues: initialValues(chat),
  })

  function setOpen(next: boolean) {
    if (!isControlled) {
      setUncontrolledOpen(next)
    }

    onOpenChange?.(next)
  }

  function handleOpenChange(next: boolean) {
    if (isPending) {
      return
    }

    setOpen(next)
    setServerError(null)

    // Re-seed on open so a cancelled draft never lingers.
    if (next) {
      form.reset(initialValues(chat))
    }
  }

  function onSubmit(values: GroupChatFormValues) {
    setServerError(null)

    startTransition(async () => {
      if (chat) {
        const result = await updateGroupChat({
          id: chat.id,
          name: values.name,
          memberIds: values.memberIds,
        })

        if (!result.ok) {
          setServerError(result.error)
          return
        }

        setOpen(false)
        return
      }

      const result = await createGroupChat(values)

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      form.reset(emptyValues)
      setOpen(false)
      router.push(`/chats/${result.chat.id}`)
    })
  }

  function handleDelete() {
    if (!chat) {
      return
    }

    setServerError(null)

    startTransition(async () => {
      const result = await deleteGroupChat(chat.id)

      setConfirmOpen(false)

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      setOpen(false)
      // The chat being viewed no longer exists, so leave for the dashboard.
      router.replace("/")
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && trigger && (
        <DialogTrigger render={trigger}>{children}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{chat ? "Edit group chat" : "New group chat"}</DialogTitle>
          <DialogDescription>
            {chat
              ? "Rename the group or change which bots are in it."
              : "Name the group and pick the bots that join it."}
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
            {chat && (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      className="sm:me-auto"
                    />
                  }
                >
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {chat.name ?? "this group chat"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the group chat and its messages. This
                      can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={isPending}
                      onClick={handleDelete}
                    >
                      {isPending && <Spinner />}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || bots.length < 2}>
              {isPending && <Spinner />}
              {chat ? "Save changes" : "Create group chat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { GroupChatDialog }
export type { GroupChatDialogProps }
