"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { useLoadTranscript, useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import { CheckIcon, MessageSquareIcon } from "lucide-react"
import { isToolUIPart, type UIMessage } from "ai"

import { loadChatTranscript, mintChatAccessToken, startChatSession } from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"
import { ChatAvatar } from "@/components/chat-avatar"
import { Badge } from "@/components/ui/badge"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import type { ChatBot } from "@/queries/chats"

function ShowScreenOutput({ output }: { output: unknown }) {
  const result = output as { screenshot?: unknown; mimeType?: unknown } | null
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.screenshot !== "string" ||
    typeof result.mimeType !== "string"
  ) {
    return <ToolOutput output={output} errorText={undefined} />
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Screen
      </h4>
      {/* Daytona returns screenshot data as base64; next/image cannot optimize it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:${result.mimeType};base64,${result.screenshot}`}
        alt="Sandbox screen"
        className="h-auto w-full rounded-md border"
      />
    </div>
  )
}

// The teammate a completed `handoff` tool call points at, if any.
function handoffTarget(message: UIMessage): string | undefined {
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue
    const toolName =
      part.type === "dynamic-tool"
        ? part.toolName
        : part.type.startsWith("tool-")
          ? part.type.slice("tool-".length)
          : undefined
    if (toolName !== "handoff") continue
    const output = part.output as
      | { handedOff?: boolean; botId?: string }
      | undefined
    if (output?.handedOff && typeof output.botId === "string") {
      return output.botId
    }
  }
  return undefined
}

function ToolCall({
  part,
  showScreenRequested,
}: {
  part: ToolPart
  showScreenRequested: boolean
}) {
  const toolName =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length)
  const done =
    part.state === "output-available" ||
    part.state === "output-error" ||
    part.state === "output-denied"
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  if (toolName === "view_screen") {
    return showScreenRequested && part.state === "output-available" ? (
      <ShowScreenOutput output={part.output} />
    ) : null
  }
  if (toolName === "handoff" && part.state === "output-available") {
    const output = part.output as { handedOff?: boolean } | undefined
    if (output?.handedOff) return null
  }

  return (
    <div className="mb-3">
      <Tool open={userOpen ?? done} onOpenChange={(open) => setUserOpen(open)}>
        {part.type === "dynamic-tool" ? (
          <ToolHeader type={part.type} state={part.state} toolName={toolName} />
        ) : (
          <ToolHeader type={part.type} state={part.state} />
        )}
        <ToolContent>
          {toolName === "show_screen" && part.state === "output-available" ? (
            <ShowScreenOutput output={part.output} />
          ) : (
            <>
              <ToolInput input={part.input} />
              <ToolOutput output={part.output} errorText={part.errorText} />
            </>
          )}
        </ToolContent>
      </Tool>
    </div>
  )
}

function Chat({
  chatId,
  kind,
  members,
}: {
  chatId: string
  kind: "direct" | "group"
  members: ChatBot[]
}) {
  // In a group chat the reply comes from the picked bot; direct chats have one.
  const [botId, setBotId] = useState(members[0]?.id ?? "")

  // Editing the roster can remove the picked bot; fall back to the first.
  const activeBotId = members.some((member) => member.id === botId)
    ? botId
    : (members[0]?.id ?? "")

  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    // The transport threads this into every turn's metadata; the agent reads it
    // to pick which bot answers.
    clientData: { botId: activeBotId },
  })

  const { messages, isLoading } = useLoadTranscript(chatId, loadChatTranscript, {
    transport,
  })

  // Mount useChat only once the transcript and the transport's resume cursor
  // describe the same history.
  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading conversation…
      </div>
    )
  }

  return (
    <ChatView
      chatId={chatId}
      kind={kind}
      members={members}
      botId={activeBotId}
      onBotIdChange={setBotId}
      transport={transport}
      initialMessages={messages}
    />
  )
}

function ChatView({
  chatId,
  kind,
  members,
  botId,
  onBotIdChange,
  transport,
  initialMessages,
}: {
  chatId: string
  kind: "direct" | "group"
  members: ChatBot[]
  botId: string
  onBotIdChange: (botId: string) => void
  transport: TriggerChatTransport
  initialMessages: UIMessage[]
}) {
  const { messages, sendMessage, status, stop: aiStop, regenerate } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0,
  })
  const [handoffNotices, setHandoffNotices] = useState<
    { userMessageId: string; botId: string }[]
  >([])

  // After a resume useChat's stop() doesn't reach the backend, so also stop the run.
  const stop = useCallback(() => {
    aiStop()
    transport.stopGeneration(chatId)
  }, [aiStop, chatId, transport])

  // A bot can hand a group turn to a teammate: once its reply finishes with a
  // `handoff` tool call, restart the turn as that teammate. `attempted` bounds
  // the chain so bots can't bounce the same prompt back and forth.
  const handoff = useRef<{ userId: string; attempted: Set<string> }>({
    userId: "",
    attempted: new Set(),
  })

  useEffect(() => {
    if (status !== "ready") return

    const last = messages.at(-1)
    if (!last || last.role !== "assistant") return

    const target = handoffTarget(last)
    if (!target || target === botId) return

    const userId =
      messages.filter((message) => message.role === "user").pop()?.id ?? ""
    if (handoff.current.userId !== userId) {
      handoff.current = { userId, attempted: new Set() }
    }
    if (handoff.current.attempted.has(target)) return
    handoff.current.attempted.add(target)
    setHandoffNotices((notices) =>
      notices.some((notice) => notice.userMessageId === userId && notice.botId === target)
        ? notices
        : [...notices, { userMessageId: userId, botId: target }]
    )

    // Set the transport's clientData directly: the prop is mirrored into the
    // transport in a later effect, so the re-run would otherwise still answer
    // as the previous bot.
    transport.setClientData({ botId: target })
    onBotIdChange(target)
    void regenerate()
  }, [messages, status, botId, transport, onBotIdChange, regenerate])

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim()
    if (!text) return
    // In a group chat, record which bot the prompt was addressed to so the
    // message can show its tag. The agent still picks the bot from clientData.
    sendMessage({
      text,
      ...(kind === "group" ? { metadata: { botId } } : {}),
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquareIcon className="size-12" />}
              title="Start a conversation"
              description="Type a message below to begin chatting"
            />
          ) : (
            messages.map((message, messageIndex) => {
              const showScreenRequested = messages
                .slice(0, messageIndex)
                .reverse()
                .find((previous) => previous.role === "user")
                ?.parts.some(
                  (part) =>
                    part.type === "text" &&
                    /\b(screenshot|captura|capturar)\b|(?:ver|dime|muestra).{0,24}(?:qué|que).{0,16}(?:hay|aparece|ves) en (?:la )?pantalla|(?:what|show me).{0,24}(?:screen|see)/i.test(part.text)
                ) ?? false

              // Group messages carry the bot they concern: the reply's author, or
              // the bot a prompt was addressed to (shown as an inline tag).
              const botId = (message.metadata as { botId?: string } | undefined)
                ?.botId
              const tagged =
                kind === "group"
                  ? members.find((candidate) => candidate.id === botId)
                  : undefined
              const member = message.role === "assistant" ? tagged : undefined
              const target = message.role === "user" ? tagged : undefined

              return (
                <div key={message.id} className="flex w-full flex-col gap-2">
                  <div className="flex w-full items-start gap-2">
                    {member && (
                      <ChatAvatar
                        seed={member.avatar}
                        className="mt-0.5 size-7 shrink-0 rounded-lg"
                      />
                    )}
                    <Message from={message.role}>
                      <MessageContent>
                        {message.parts.map((part, index) => {
                          if (part.type === "text") {
                            if (index === 0 && target) {
                              return (
                                <div
                                  key={`${message.id}-${index}`}
                                  className="flow-root"
                                >
                                  {/* Floated so the prompt's first line wraps
                                      alongside it, like a tag. */}
                                  <Badge
                                    variant="outline"
                                    className="float-left mr-2 gap-1 py-0"
                                  >
                                    <ChatAvatar
                                      seed={target.avatar}
                                      className="size-3.5 rounded-sm"
                                    />
                                    <span className="max-w-28 truncate">
                                      {target.name}
                                    </span>
                                  </Badge>
                                  <MessageResponse>{part.text}</MessageResponse>
                                </div>
                              )
                            }
                            return (
                              <MessageResponse key={`${message.id}-${index}`}>
                                {part.text}
                              </MessageResponse>
                            )
                          }
                          if (
                            part.type === "dynamic-tool" ||
                            part.type.startsWith("tool-")
                          ) {
                            return (
                              <ToolCall
                                key={`${message.id}-${index}`}
                                part={part as ToolPart}
                                showScreenRequested={showScreenRequested}
                              />
                            )
                          }
                          return null
                        })}
                      </MessageContent>
                    </Message>
                  </div>
                  {message.role === "user" &&
                    handoffNotices
                      .filter((notice) => notice.userMessageId === message.id)
                      .map((notice) => (
                        <div
                          key={notice.botId}
                          role="status"
                          className="flex items-center gap-2 pl-9 text-sm text-muted-foreground"
                        >
                          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-300 text-emerald-950">
                            <CheckIcon className="size-3" />
                          </span>
                          Handed off to {members.find((item) => item.id === notice.botId)?.name ?? "teammate"}
                        </div>
                      ))}
                </div>
              )
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl shrink-0 p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Send a message..." />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {kind === "group" && (
                <PromptInputSelect
                  value={botId}
                  onValueChange={(value) => {
                    if (typeof value === "string") onBotIdChange(value)
                  }}
                  items={members.map((member) => ({
                    value: member.id,
                    label: member.name,
                  }))}
                >
                  <PromptInputSelectTrigger type="button" size="sm">
                    <ChatAvatar
                      seed={
                        members.find((member) => member.id === botId)?.avatar ??
                        members[0].avatar
                      }
                      className="size-5 rounded-md"
                    />
                    <PromptInputSelectValue />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent align="start">
                    {members.map((member) => (
                      <PromptInputSelectItem key={member.id} value={member.id}>
                        {member.name}
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

export { Chat }
