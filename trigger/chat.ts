import { openai } from "@ai-sdk/openai"
import { chat } from "@trigger.dev/sdk/ai"
import { tool } from "ai"
import { z } from "zod"

import { ensureComputerUse, getBotSandbox } from "@/lib/daytona"
import { getChatBot } from "@/queries/chats"

// The bot the user picked in the composer for this turn. Optional so a direct
// chat (or an older client) falls back to the chat's first member.
export const clientDataSchema = z.object({
  botId: z.string().min(1).optional(),
})

// The requested bot when it belongs to the chat, else the first member.
async function resolveBot(chatId: string, botId?: string) {
  return (await getChatBot(chatId, botId)) ?? (await getChatBot(chatId))
}

export const chatAgent = chat.agent({
  id: "chat",
  clientDataSchema,
  tools: (event) => buildSandboxTools(event.chatId, event.clientData?.botId),
  run: async ({ messages, tools, signal, streamText, chatId, clientData }) => {
    const bot = await resolveBot(chatId, clientData?.botId)

    return streamText({
      model: openai("gpt-6-astra"),
      messages,
      tools,
      system: systemPrompt(bot),
      abortSignal: signal,
    })
  },
})

function buildSandboxTools(chatId: string, botId?: string) {
  let sandboxId: Promise<string> | undefined
  const requireSandboxId = () => {
    sandboxId ??= resolveBot(chatId, botId).then((bot) => {
      if (!bot?.sandboxId) throw new Error("This bot has no cloud sandbox assigned yet.")
      return bot.sandboxId
    })
    return sandboxId
  }
  const getSandbox = async () => getBotSandbox(await requireSandboxId())
  const getDesktopSandbox = async () => {
    const id = await requireSandboxId()
    await ensureComputerUse(id)
    return getBotSandbox(id)
  }
  const takeScreenshot = async () => {
    const shot = await (await getDesktopSandbox()).computerUse.screenshot.takeCompressed({
      format: "png",
    })
    return {
      screenshot: shot.screenshot ?? "",
      mimeType: "image/png" as const,
      sizeBytes: shot.sizeBytes ?? 0,
    }
  }
  const screenshotToModel = ({
    output,
  }: {
    output: { screenshot?: string; sizeBytes?: number }
  }) => ({
    type: "content" as const,
    value: output.screenshot
      ? [
          {
            type: "text" as const,
            text: `Screenshot of the sandbox screen (${output.sizeBytes ?? 0} bytes).`,
          },
          {
            type: "file" as const,
            mediaType: "image/png" as const,
            data: { type: "data" as const, data: output.screenshot },
          },
        ]
      : [{ type: "text" as const, text: "No screenshot could be captured." }],
  })

  return {
    bash: tool({
      description:
        "Run a shell or terminal command in this bot's isolated Linux sandbox. For websites and graphical applications, use the screen, mouse, and keyboard tools instead.",
      inputSchema: z.object({
        command: z.string().min(1),
        cwd: z.string().optional(),
        timeout: z.number().int().min(1).max(600).optional(),
      }),
      execute: async ({ command, cwd, timeout }) => {
        if (/\b(?:chromium(?:-browser)?|google-chrome(?:-stable)?|firefox|xdg-open|sensible-browser)\b/i.test(command)) {
          return {
            exitCode: 126,
            output:
              "Open and control websites with the screen, mouse, and keyboard tools instead of launching a browser from the terminal.",
          }
        }
        const response = await (await getSandbox()).process.executeCommand(
          command,
          cwd,
          undefined,
          timeout ?? 60
        )
        return { exitCode: response.exitCode, output: response.result || "" }
      },
    }),
    read_file: tool({
      description: "Read a file from this bot's sandbox.",
      inputSchema: z.object({ path: z.string().min(1) }),
      execute: async ({ path }) => {
        const buffer = await (await getSandbox()).fs.downloadFile(path)
        if (buffer.includes(0)) {
          return { path, binary: true, sizeBytes: buffer.length }
        }
        const content = buffer.toString("utf8")
        return {
          path,
          sizeBytes: buffer.length,
          content: content.slice(0, 60000),
          truncated: content.length > 60000,
        }
      },
    }),
    write_file: tool({
      description: "Create or overwrite a text file in this bot's sandbox.",
      inputSchema: z.object({ path: z.string().min(1), content: z.string() }),
      execute: async ({ path, content }) => {
        await (await getSandbox()).fs.uploadFile(Buffer.from(content, "utf8"), path)
        return { path, writtenBytes: Buffer.byteLength(content, "utf8") }
      },
    }),
    list_files: tool({
      description: "List files and directories in a sandbox directory.",
      inputSchema: z.object({ path: z.string().min(1).default(".") }),
      execute: async ({ path }) => {
        const entries = await (await getSandbox()).fs.listFiles(path)
        return entries.map((entry) => ({
          name: entry.name,
          path: entry.path ?? path,
          isDir: entry.isDir,
          size: entry.size,
        }))
      },
    }),
    mouse_click: tool({
      description: "Click the mouse at pixel coordinates on the sandbox screen.",
      inputSchema: z.object({
        x: z.number(),
        y: z.number(),
        button: z.enum(["left", "right", "middle"]).optional(),
        doubleClick: z.boolean().optional(),
      }),
      execute: async ({ x, y, button, doubleClick }) => {
        await (await getDesktopSandbox()).computerUse.mouse.click(x, y, button, doubleClick)
        return { x, y, button: button ?? "left", doubleClick: doubleClick ?? false }
      },
    }),
    mouse_move: tool({
      description: "Move the mouse cursor to pixel coordinates on the sandbox screen.",
      inputSchema: z.object({ x: z.number(), y: z.number() }),
      execute: async ({ x, y }) => {
        await (await getDesktopSandbox()).computerUse.mouse.move(x, y)
        return { x, y }
      },
    }),
    mouse_scroll: tool({
      description: "Scroll the mouse wheel on the sandbox screen.",
      inputSchema: z.object({
        x: z.number(),
        y: z.number(),
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ x, y, direction, amount }) => {
        await (await getDesktopSandbox()).computerUse.mouse.scroll(x, y, direction, amount ?? 1)
        return { x, y, direction, amount: amount ?? 1 }
      },
    }),
    keyboard_type: tool({
      description: "Type text on the sandbox keyboard.",
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        await (await getDesktopSandbox()).computerUse.keyboard.type(text)
        return { typedCharacters: text.length }
      },
    }),
    keyboard_press: tool({
      description: "Press a key, optionally with modifier keys, on the sandbox keyboard.",
      inputSchema: z.object({
        key: z.string().min(1),
        modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).optional(),
      }),
      execute: async ({ key, modifiers }) => {
        await (await getDesktopSandbox()).computerUse.keyboard.press(key, modifiers)
        return { key, modifiers: modifiers ?? [] }
      },
    }),
    view_screen: tool({
      description:
        "Capture the sandbox screen for internal inspection only. Never use this to fulfill a user's request for a screenshot or to see the screen; its output is hidden from chat.",
      inputSchema: z.object({}),
      execute: takeScreenshot,
      toModelOutput: screenshotToModel,
    }),
    show_screen: tool({
      description:
        "Capture the sandbox screen and show it in chat whenever the user requests a screenshot or asks what is visible on screen.",
      inputSchema: z.object({}),
      execute: takeScreenshot,
      toModelOutput: screenshotToModel,
    }),
  }
}

function systemPrompt(bot: Awaited<ReturnType<typeof getChatBot>>): string {
  if (!bot) {
    return [
      "Eres un compañero de equipo de IA.",
      "Tu nombre, trabajo y propósito aún no están configurados.",
      "No tienes un entorno sandbox asignado.",
    ].join("\n")
  }

  return [
    `Tu nombre es ${bot.name}.`,
    `Tu trabajo es: ${bot.job}.`,
    `Tu propósito es: ${bot.instructions?.trim() || "No se ha definido un propósito adicional."}`,
    bot.sandboxId
      ? `Tu entorno de trabajo es un sandbox aislado de Daytona (ID: ${bot.sandboxId}). Opera únicamente dentro de ese entorno.`
      : "No tienes un entorno sandbox asignado.",
    "Ayuda al usuario a completar tareas de forma directa. No afirmes que hiciste algo hasta que la operación haya terminado correctamente.",
    "Usa el terminal y los archivos para tareas de sistema. Para sitios web o aplicaciones gráficas, inspecciona la pantalla, interactúa con el ratón y el teclado, y vuelve a revisarla después de cada cambio importante. No abras navegadores mediante bash.",
    "Mantén los comandos y cambios de archivos dentro del sandbox asignado.",
    "Si el usuario pide una captura o quiere ver qué aparece en pantalla, usa show_screen para mostrarla en el chat. Reserva view_screen para inspección interna; su resultado no se muestra al usuario.",
  ].join("\n")
}
