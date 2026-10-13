import { openai } from "@ai-sdk/openai"
import { DaytonaFileNotFoundError } from "@daytona/sdk"
import { chat } from "@trigger.dev/sdk/ai"
import { tool } from "ai"
import { z } from "zod"

import { ensureComputerUse, getBotSandbox, writeSandboxFile } from "@/lib/daytona"
import { getChat, getChatBot, type ChatBot, type ChatDetail } from "@/queries/chats"

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
  tools: async (event) => {
    const chatDetail = await getChat(event.chatId)
    const currentBot =
      chatDetail?.members.find(
        (member) => member.id === event.clientData?.botId
      ) ?? chatDetail?.members[0]
    return {
      ...buildSandboxTools(
        event.chatId,
        event.clientData?.botId,
        chatDetail?.kind === "direct"
      ),
      // A direct chat has one bot, so handoff only exists in groups. The tool
      // must be declared here (not merged into `run`'s streamText), because the
      // agent converts persisted history against this resolved set.
      ...(chatDetail?.kind === "group"
        ? buildHandoffTool(chatDetail, currentBot?.id)
        : {}),
    }
  },
  run: async ({ messages, tools, signal, streamText, chatId, clientData }) => {
    const chatDetail = await getChat(chatId)
    const bot =
      chatDetail?.members.find((member) => member.id === clientData?.botId) ??
      chatDetail?.members[0]

    // Tag the reply with its bot so the client can show that bot's avatar beside
    // the message. Rides on the message (and the transcript), not the turn.
    chat.setUIMessageStreamOptions({
      messageMetadata: () => ({ botId: bot?.id }),
    })

    return streamText({
      model: openai("gpt-6-astra"),
      messages,
      tools,
      system: systemPrompt(bot, chatDetail),
      abortSignal: signal,
    })
  },
})

function buildSandboxTools(
  chatId: string,
  botId?: string,
  allowMemoryWrite = false
) {
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
        const sandbox = await getSandbox()
        let buffer: Buffer
        try {
          buffer = await sandbox.fs.downloadFile(path)
        } catch (error) {
          if (
            !(error instanceof DaytonaFileNotFoundError) ||
            path !== "/home/daytona/MEMORY.md"
          ) {
            throw error
          }

          await writeSandboxFile(sandbox, path, "\n")
          buffer = Buffer.from("\n")
        }
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
        await writeSandboxFile(await getSandbox(), path, content)
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
    ...(allowMemoryWrite
      ? {
          remember: tool({
            description:
              "Save a stable, non-sensitive personal fact the user shared in this private chat to MEMORY.md for future conversations. Add it without deleting existing memories. Do not save credentials, secrets, or sensitive data.",
            inputSchema: z.object({
              fact: z.string().trim().min(1).max(500),
            }),
            execute: async ({ fact }) => {
              const sandbox = await getSandbox()
              let memory: string
              try {
                memory = (await sandbox.fs.downloadFile("/home/daytona/MEMORY.md")).toString("utf8")
              } catch (error) {
                if (!(error instanceof DaytonaFileNotFoundError)) throw error
                memory = ""
              }

              const note = `- ${fact.trim()}`
              if (
                memory
                  .split(/\r?\n/)
                  .some((line) => line.trim().toLowerCase() === note.toLowerCase())
              ) {
                return { saved: false, reason: "This memory is already saved." }
              }

              const updatedMemory = `${memory.trimEnd()}${memory.trim() ? "\n" : ""}${note}\n`
              await writeSandboxFile(sandbox, "/home/daytona/MEMORY.md", updatedMemory)
              return { saved: true, path: "/home/daytona/MEMORY.md" }
            },
          }),
        }
      : {}),
  }
}

// A group-chat-only tool. The bot names a teammate; the reply's tool result
// carries that teammate's id, which the client uses to restart the turn as them.
function buildHandoffTool(chatDetail: ChatDetail, currentBotId?: string) {
  const teammates = chatDetail.members.filter(
    (member) => member.id !== currentBotId
  )
  const choices = teammates
    .map((member) => `${member.id}: ${member.name} (${member.job})`)
    .join("; ")

  return {
    handoff: tool({
      description: `Hand this request to a teammate in this group chat when they are better suited to answer it. Choose the teammate by botId from this list: ${choices}. After calling this, do not answer the request yourself - the teammate will respond.`,
      inputSchema: z.object({
        botId: z
          .string()
          .min(1)
          .describe(`The botId of the teammate to hand off to: ${choices}.`),
      }),
      execute: async ({ botId }) => {
        const target = teammates.find((member) => member.id === botId)
        if (!target) {
          return {
            handedOff: false,
            error: `There is no teammate with id "${botId}". Teammates: ${choices}.`,
          }
        }
        return { handedOff: true, botId: target.id, name: target.name }
      },
    }),
  }
}

function systemPrompt(
  bot: ChatBot | undefined,
  chatDetail: ChatDetail | null
): string {
  if (!bot) {
    return [
      "Eres un compañero de equipo de IA.",
      "Tu nombre, trabajo y propósito aún no están configurados.",
      "No tienes un entorno sandbox asignado.",
    ].join("\n")
  }

  const lines = [
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
    "Tu memoria persistente está en /home/daytona/MEMORY.md dentro de tu sandbox. Cuando una petición dependa de preferencias, decisiones o contexto previo del usuario, léela con read_file antes de responder.",
    "En chats privados 1:1, cuando el usuario comparta un dato personal estable que pueda ser útil en otra conversación —sobre sí mismo, sus mascotas, familia, preferencias o proyectos— debes guardarlo en MEMORY.md antes de responder usando remember. Por ejemplo, si dice 'mi perro se llama Xia', guarda 'El perro del usuario se llama Xia'. La herramienta agrega el dato y conserva los recuerdos anteriores. No guardes cada mensaje, credenciales, secretos ni datos sensibles.",
  ]

  if (chatDetail?.kind === "group") {
    const teammates = chatDetail.members.filter(
      (member) => member.id !== bot.id
    )
    lines.push(
      `Estás en un chat grupal llamado "${chatDetail.name ?? "sin nombre"}": colaboras con otros compañeros de IA del equipo para ayudar al usuario.`,
      "Tus herramientas son: bash, read_file, write_file y list_files para el terminal y los archivos; mouse_click, mouse_move, mouse_scroll, keyboard_type y keyboard_press para controlar la pantalla gráfica del sandbox; show_screen para mostrar la pantalla en el chat; view_screen solo para inspección interna; y handoff para derivar la petición a un compañero."
    )
    lines.push(
      "Las herramientas de terminal y pantalla solo operan en tu propio sandbox.",
      "En chats grupales, consulta tu MEMORY.md cuando la petición dependa de algo que el usuario contó en una conversación privada. Usa solo el dato pertinente y no reveles secretos ni detalles sensibles. Cada compañero tiene su propia memoria; si otro compañero puede conocer mejor ese contexto privado, deriva la petición con handoff.",
      "Usa handoff solo cuando otro compañero este mejor preparado; el destino se elige por botId. Tras derivar, no respondas al usuario. El companero recibira la peticion original."
    )
    if (teammates.length > 0) {
      lines.push(
        `Tus compañeros en este chat: ${teammates
          .map((member) => `${member.id}: ${member.name} (${member.job})`)
          .join(", ")}.`,
        "Si otro compañero esta mejor preparado, llama a handoff con su botId exacto y no respondas tu. El compañero recibira la peticion original y continuara la conversacion."
      )
    }
  } else if (chatDetail?.kind === "direct") {
    lines.push(
      "Estás en un chat privado 1:1 con el usuario. Conserva en MEMORY.md los datos estables y no sensibles que el usuario comparta y que puedan ayudar en conversaciones futuras."
    )
  }

  return lines.join("\n")
}
