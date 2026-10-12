import { openai } from "@ai-sdk/openai"
import { chat } from "@trigger.dev/sdk/ai"

export const chatAgent = chat.agent({
  id: "chat",
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: openai("gpt-6-astra"),
      messages,
      abortSignal: signal,
    }),
})