"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, ShuffleIcon } from "lucide-react"
import { nanoid } from "nanoid"
import { useRouter } from "next/navigation"
import type { ReactElement, ReactNode } from "react"
import { useState, useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { createBot, deleteBot, updateBot } from "@/actions/bot"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { ChatBot } from "@/queries/chats"

const botFormSchema = z.object({
  avatar: z.string(),
  name: z
    .string()
    .trim()
    .min(1, "Give your bot a name.")
    .max(50, "Keep the name under 50 characters."),
  job: z
    .string()
    .trim()
    .min(1, "Tell your bot what to do.")
    .max(120, "Keep the job under 120 characters."),
  instructions: z
    .string()
    .max(1000, "Keep the instructions under 1000 characters."),
})

type BotFormValues = z.infer<typeof botFormSchema>

const presets = [
  {
    label: "Research assistant",
    job: "Research assistant",
    instructions:
      "Answer briefly, cite sources, and ask before running anything destructive.",
  },
  {
    label: "Code reviewer",
    job: "Code reviewer",
    instructions:
      "Review changes for bugs and security issues, then suggest concrete fixes.",
  },
  {
    label: "Writing editor",
    job: "Writing editor",
    instructions: "Tighten my drafts, fix grammar, and keep my voice intact.",
  },
  {
    label: "Tutor",
    job: "Tutor",
    instructions:
      "Explain concepts step by step and check my understanding with questions.",
  },
] as const

function emptyValues(): BotFormValues {
  return { avatar: nanoid(), name: "", job: "", instructions: "" }
}

// The form starts from the bot being edited, or blank when creating one.
function initialValues(bot?: ChatBot): BotFormValues {
  return bot
    ? {
        avatar: bot.avatar,
        name: bot.name,
        job: bot.job,
        instructions: bot.instructions ?? "",
      }
    : emptyValues()
}

type BotDialogProps = {
  // When set, the dialog edits this bot instead of creating a new one.
  bot?: ChatBot
  // The trigger button rendered in uncontrolled mode; `children` is its label.
  trigger?: ReactElement
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function BotDialog({
  bot,
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
}: BotDialogProps = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<BotFormValues>({
    resolver: zodResolver(botFormSchema),
    defaultValues: initialValues(bot),
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

    // Re-seed on open so the fields always match the latest saved bot.
    if (next) {
      form.reset(initialValues(bot))
    }
  }

  function applyPreset(preset: (typeof presets)[number]) {
    form.setValue("job", preset.job, { shouldValidate: true })
    form.setValue("instructions", preset.instructions, { shouldValidate: true })
  }

  function onSubmit(values: BotFormValues) {
    setServerError(null)

    startTransition(async () => {
      const result = await (bot
        ? updateBot({
            id: bot.id,
            avatar: values.avatar,
            name: values.name,
            job: values.job,
            instructions: values.instructions.trim() || undefined,
          })
        : createBot({
            avatar: values.avatar,
            name: values.name,
            job: values.job,
            instructions: values.instructions.trim() || undefined,
          }))

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      if (!bot) {
        form.reset(emptyValues())
      }

      setOpen(false)
    })
  }

  function handleDelete() {
    if (!bot) {
      return
    }

    setServerError(null)

    startTransition(async () => {
      const result = await deleteBot(bot.id)

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
      {!isControlled &&
        (trigger ? (
          <DialogTrigger render={trigger}>{children}</DialogTrigger>
        ) : (
          <DialogTrigger render={<Button variant="secondary" />}>
            <PlusIcon data-icon="inline-start" />
            Create a new bot
          </DialogTrigger>
        ))}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bot ? "Edit bot" : "New bot"}</DialogTitle>
          <DialogDescription>
            {bot
              ? "Change its face, name, or job."
              : "Give it a face, a name, and a job to do."}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <Controller
              control={form.control}
              name="avatar"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <ChatAvatar seed={field.value} className="size-10" />
                  <FieldContent>
                    <FieldTitle>Face</FieldTitle>
                    <FieldDescription>
                      Shuffle until you find one you like.
                    </FieldDescription>
                  </FieldContent>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => field.onChange(nanoid())}
                  >
                    <ShuffleIcon data-icon="inline-start" />
                    Shuffle
                  </Button>
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="bot-name"
                    placeholder="Ada"
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
              name="job"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-job">Job</FieldLabel>
                  <Input
                    {...field}
                    id="bot-job"
                    placeholder="Research assistant"
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
              name="instructions"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="bot-instructions">
                    How it should work
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="bot-instructions"
                    rows={4}
                    className="resize-none"
                    placeholder="Answer briefly, cite sources, and ask before running anything destructive."
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            {serverError && <FieldError errors={[{ message: serverError }]} />}
          </FieldGroup>

          <DialogFooter>
            {bot && (
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
                    <AlertDialogTitle>Delete {bot.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the bot and its chat. This can&apos;t be
                      undone.
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
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              {bot ? "Save changes" : "Create bot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { BotDialog }
export type { BotFormValues }
