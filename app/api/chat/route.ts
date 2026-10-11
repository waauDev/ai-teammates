import { openai } from "@ai-sdk/openai"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json()

  const result = streamText({
    model: openai("gpt-6-astra"),
    messages: await convertToModelMessages(messages),
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  })
}
