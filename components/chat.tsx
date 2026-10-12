"use client"

import { useCallback } from "react"
import { useChat } from "@ai-sdk/react"
import { useLoadTranscript, useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import { MessageSquareIcon } from "lucide-react"
import type { UIMessage } from "ai"

import { loadChatTranscript, mintChatAccessToken, startChatSession } from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"
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
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"

function Chat({ chatId }: { chatId: string }) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) => startChatSession({ chatId, clientData }),
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
    <ChatView chatId={chatId} transport={transport} initialMessages={messages} />
  )
}

function ChatView({
  chatId,
  transport,
  initialMessages,
}: {
  chatId: string
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
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquareIcon className="size-12" />}
              title="Start a conversation"
              description="Type a message below to begin chatting"
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts.map((part, index) =>
                    part.type === "text" ? (
                      <MessageResponse key={`${message.id}-${index}`}>
                        {part.text}
                      </MessageResponse>
                    ) : null
                  )}
                </MessageContent>
              </Message>
            ))
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
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

export { Chat }