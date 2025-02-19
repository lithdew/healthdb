import { createParser } from "eventsource-parser";
import type { AskWithGeminiBody, GeminiEvent } from "./gemini";
import type { z } from "zod";

export async function* askWithGemini(body: AskWithGeminiBody) {
  const response = await fetch("/ask", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (response.body === null) {
    throw new Error("Failed to get response body");
  }

  const stream = response.body.pipeThrough(
    new TextDecoderStream("utf-8", { fatal: true }),
  );

  const readable = new ReadableStream<GeminiEvent>({
    async start(controller) {
      const parser = createParser({
        onEvent(event) {
          controller.enqueue(JSON.parse(event.data));
        },
      });

      // @ts-expect-error TODO: fix this
      for await (const chunk of stream) {
        parser.feed(chunk);
      }

      controller.close();
    },
  });

  // @ts-expect-error TODO: fix this
  for await (const chunk of readable) {
    const event = chunk as GeminiEvent;
    yield event;

    if (event.candidates[0]?.finishReason === "STOP") {
      break;
    }
  }
}

export async function readAll(
  response: AsyncGenerator<GeminiEvent, void, unknown>,
) {
  let content = "";
  for await (const chunk of response) {
    const text = chunk.candidates[0]?.content.parts[0]?.text;
    if (text !== undefined) {
      content += text;
    }
  }

  return content;
}

export async function readAllAndValidate<TSchema extends z.ZodTypeAny>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: AsyncGenerator<GeminiEvent, any, unknown>,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  const content = await readAll(response);
  return schema.parse(JSON.parse(content));
}
