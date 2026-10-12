<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.



<!-- END:nextjs-agent-rules -->
## Git
These rules override any default or built-in agent guidance about git, including guidance to branch before committing on the default branch.

Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.


## Before you write
Read the task and the code it touches. List every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.

## The smallest complete change
Take the first option that fully works:

Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line. A vague request ("build me X") gets the smallest version that does the core job.
Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.
An installed dependency? Use it. Never add a dependency for a few lines.
Can it be one line a reader gets at a glance? One line.
Otherwise: the minimum code that works.
Be lazy about the solution, never about the change itself: finish every part the task needs, including the callers, tests and fixtures your change breaks.
No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Keep values in the form the platform already gives you. Deletion beats addition. Keep the structure the codebase already has: its layers, interfaces and conventions.
The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
Comment only the why the code cannot show, in one line.
Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.
Code you move or merge keeps its error handling and validation.
Between options of equal size, take the one that is correct on edge cases.
Lazy code without its check is unfinished: new non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) leaves one small test or an assert-based self-check. Trivial changes need none.
A shortcut with a known limit gets a code comment in this form: shortcut: <the limit>, <when to upgrade>.
Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.

(Yes, this file also applies to agents working on the ponytail repo itself. Especially to them.)

## Database
This is a development project. There is no backwards compatibility and the data is worthless. Prefer data loss: never backfill, migrate, or preserve existing rows, and never spend effort on keeping old data working. Every schema change means a clean slate.

Apply schema changes only with npm run db:push (drizzle-kit push).
Never use migrations: do not run drizzle-kit generate or drizzle-kit migrate, and do not create migration files or a drizzle/ folder.


## Forms

Forms are shadcn/ui `Field` primitives + react-hook-form + zod 4 (via
`@hookform/resolvers/zod`). The shadcn style here is `base-nova` on Base UI, not
Radix. There is no `components/ui/form.tsx` and you must not add one: compose
fields with the `Field` family from `components/ui/field.tsx`.

Check what already exists before writing UI: `npx shadcn@latest info --json`,
then `npx shadcn@latest docs <component>` and fetch the example URLs it prints.

Client form:

```tsx
"use client"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"

const schema = z.object({ name: z.string().trim().min(1, "Required") })
const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
  defaultValues: { name: "" },
})

<Controller
  name="name"
  control={form.control}
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor="name">Name</FieldLabel>
      <Input {...field} id="name" aria-invalid={fieldState.invalid} />
      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
    </Field>
  )}
/>
```

- Use `<Controller>` (not bare `register`) so `field` and `fieldState` arrive
  together. Spread `field` onto the control, set `data-invalid` on `Field` and
  `aria-invalid` on the control, and render errors with
  `<FieldError errors={[fieldState.error]} />` (it also accepts Standard Schema
  `issues`).
- `FieldTitle` for label-styled text that has no control (e.g. a "Face" row),
  `FieldDescription` for helper text, `FieldGroup` to space a stack of fields.
- zod is v4: `import { z } from "zod"`, `zodResolver` from
  `"@hookform/resolvers/zod"`.
- Keep the form schema in the client component (or another zod-only module).
  Never import `lib/db/schema.ts` into a client component: it drags drizzle-orm
  into the browser bundle.

Server-side validation uses a schema generated from the table, never a
hand-written one. In `lib/db/schema.ts`:

```ts
import { createInsertSchema } from "drizzle-zod"

export const insertBotSchema = createInsertSchema(bots, {
  name: (s) => s.trim().min(1).max(50),
  instructions: (s) => s.max(1000).optional(),
})
export const createBotSchema = insertBotSchema.omit({
  id: true, userId: true, createdAt: true, sandboxId: true,
})
export type CreateBotInput = z.infer<typeof createBotSchema>
```

- Add per-column rules in the second argument. A refined nullable column loses
  its insert optionality, so append `.optional()` yourself when the column is
  optional.
- `.omit()` the columns the server owns (`userId`, `id`, `createdAt`,
  `sandboxId`) so a client can never set them.

Server actions live in `actions/<name>.ts`, start with `"use server"`, and may
export only async functions:

```ts
"use server"
import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

export async function createBot(input: CreateBotInput) {
  const { userId } = await auth()
  if (!userId) return { ok: false, error: "You must be signed in." }

  const parsed = createBotSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Some details need another look." }

  const [bot] = await db.insert(bots).values({ ...parsed.data, userId }).returning()
  revalidatePath("/")
  return { ok: true, bot }
}
```

- Take the user id from Clerk with `await auth()`; the action owns `userId`.
- Treat every action as a public endpoint: `safeParse` the input again on the
  server even though the client already validated it.
- On auth failure return a result object; do not throw or redirect.
- Call `revalidatePath` after a write and return a discriminated result
  (`{ ok: true, ... } | { ok: false, error }`) the client can read.

Dialogs wrap the form. Trigger through Base UI's `render` prop and keep the
`FieldGroup` and `DialogFooter` inside a single `<form>`:

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger render={<Button variant="secondary" />}>Open</DialogTrigger>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>...</DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>...</FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline">Cancel</Button>
        <Button type="submit">Create bot</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

Finish forms with `npm run typecheck`, `npx eslint <changed files>`, and
`npm run build`.


## DiceBear

Use DiceBear 10. Documentation: https://www.dicebear.com/llms.txt

There are seven native cores with identical output, not one library with
wrappers. Use the one matching this project's language. Do not reach for the
JavaScript core when the project is written in something else:

    JavaScript  @dicebear/core + @dicebear/styles
    PHP         dicebear/core + dicebear/styles
    Python      dicebear-core + dicebear-styles
    Rust        dicebear-core + dicebear-styles
    Go          github.com/dicebear/dicebear-go/v10 + github.com/dicebear/styles/v10
    Dart        dicebear_core + dicebear_styles
    C#          DiceBear.Core + DiceBear.Styles

Every style page carries a loading snippet for all seven, for example
https://www.dicebear.com/styles/lorelei/index.md

HTTP API: https://api.dicebear.com/10.x/<style>/svg?seed=<seed> The seed is a
query parameter, not a path segment. Options are query parameters too; array
values are separated by commas.

Options named after a component end in Variant: eyesVariant, not eyes. This
holds in all seven cores and in the HTTP API. Look up the options of a style at
https://api.dicebear.com/10.x/<style>/options.json

Write these forms, not the ones on the left. The left column is pre-10 and the
API does not reject it, so an outdated call runs and silently does the wrong
thing:

    avatars.dicebear.com/api/<style>/<seed>.svg  ->  api.dicebear.com/10.x/<style>/svg?seed=<seed>
    api.dicebear.com/9.x/<style>/svg             ->  api.dicebear.com/10.x/<style>/svg
    npm install @dicebear/collection             ->  npm install @dicebear/styles
    npm install @dicebear/lorelei                ->  npm install @dicebear/styles
    createAvatar(lorelei, { seed })              ->  new Avatar(new Style(definition), { seed })
    { eyes: ['variant01'] }                      ->  { eyesVariant: ['variant01'] }
    ?radius=50                                   ->  ?borderRadius=50

Only JavaScript and the HTTP API have a pre-10 form. The other six cores were
released in 2026 and never had one, so any older-looking PHP, Python, Rust, Go,
Dart or C# API attributed to DiceBear is invented rather than outdated.


## Deployment

- The app deploys to Railway (project `ai-teammates`, service `ai-teammates`,
  production environment) and auto-deploys on push to `main`. Env variables for
  the deployment live in the Railway production environment — use the Railway
  MCP `set-variables` tool, not `.env.local`.
- `TRIGGER_SECRET_KEY` on the deployment is a **different key** than the one in
  `.env.local` (that one is the local dev key `tr_dev_sk_...`). The deployment
  uses its own production key already set on Railway — do not overwrite it with
  the dev key.
- `DAYTONA_API_KEY` / `DAYTONA_API_URL` are the same in dev and prod (values in
  `.env.local`).

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.agents/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`, `trigger-authoring-tasks`, `trigger-cost-savings`, `trigger-chat-agent-advanced`, `trigger-getting-started`, `trigger-realtime-and-frontend`.
<!-- TRIGGER.DEV SKILLS END -->
