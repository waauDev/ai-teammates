"use client"

import { useCallback, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { useLoadTranscript, useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import { MessageSquareIcon } from "lucide-react"
import type { UIMessage } from "ai"

import { loadChatTranscript, mintChatAccessToken, startChatSession } from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"
import { ChatAvatar } from "@/components/chat-avatar"
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

  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    // The transport threads this into every turn's metadata; the agent reads it
    // to pick which bot answers.
    clientData: { botId },
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
      botId={botId}
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
  const { messages, sendMessage, status, stop: aiStop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: initialMessages.length > 0,
  })

  // After a resume useChat's stop() doesn't reach the backend, so also stop the run.
  const stop = useCallback(() => {
    aiStop()
    transport.stopGeneration(chatId)
  }, [aiStop, chatId, transport])

  function handleSubmit(message: PromptInputMessage) {
    if (message.text.trim()) sendMessage({ text: message.text })
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

              return (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
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
