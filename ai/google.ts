import { zodToVertexSchema } from "@techery/zod-to-vertex-schema";
import { createParser } from "eventsource-parser";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import {
  geminiCountTokensResponse,
  type AskWithGeminiParams,
  type GeminiEvent,
} from "./gemini";

export const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
  keyFile: "./service_account.json",
});

export async function* askWithGemini(params: AskWithGeminiParams) {
  const apiKey = await auth.getAccessToken();
  if (apiKey === null || apiKey === undefined) {
    throw new Error("Failed to get Google API key");
  }

  const body = { ...params.body };

  if (
    body.generationConfig?.responseSchema !== undefined &&
    body.generationConfig.responseSchema instanceof z.Schema
  ) {
    body.generationConfig.responseSchema = zodToVertexSchema(
      body.generationConfig.responseSchema
    );
  }

  for (const tool of body.tools ?? []) {
    for (const functionDeclaration of tool.functionDeclarations ?? []) {
      if (functionDeclaration.parameters instanceof z.Schema) {
        functionDeclaration.parameters = zodToVertexSchema(
          functionDeclaration.parameters
        );
      }
    }
  }

  const response = await fetch(
    `https://${params.location}-aiplatform.googleapis.com/v1/projects/${params.projectId}/locations/${params.location}/publishers/google/models/${params.model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (response.body === null) {
    throw new Error("Failed to get response body");
  }

  const stream = response.body.pipeThrough(
    new TextDecoderStream("utf-8", { fatal: true })
  );

  const readable = new ReadableStream<GeminiEvent>({
    async start(controller) {
      const parser = createParser({
        onEvent(event) {
          controller.enqueue(JSON.parse(event.data));
        },
      });

      // @ts-expect-error - This is a valid async generator function
      for await (const chunk of stream) {
        parser.feed(chunk);
      }

      controller.close();
    },
  });

  // @ts-expect-error - This is a valid async generator function
  for await (const chunk of readable) {
    const event = chunk as GeminiEvent;

    yield event;

    if (event.candidates[0]?.finishReason === "STOP") {
      break;
    }
  }
}

export async function countTokens(params: AskWithGeminiParams) {
  const apiKey = await auth.getAccessToken();
  if (apiKey === null || apiKey === undefined) {
    throw new Error("Failed to get Google API key");
  }

  const response = await fetch(
    `https://${params.location}-aiplatform.googleapis.com/v1/projects/${params.projectId}/locations/${params.location}/publishers/google/models/${params.model}:countTokens?alt=sse`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(params.body),
    }
  );

  const text = await response.text();
  // endpoint responds with weird 'data: ' prefix, so have to replace first
  return geminiCountTokensResponse.parse(
    JSON.parse(text.replace("data: ", ""))
  );
}

export async function readAll(
  response: AsyncGenerator<GeminiEvent, void, unknown>
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
  response: AsyncGenerator<GeminiEvent, void, unknown>,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  const content = await readAll(response);
  return schema.parse(JSON.parse(content));
}

if (import.meta.main) {
  const response = askWithGemini({
    location: "us-central1",
    projectId: "lithdew",
    model: "gemini-1.5-flash",
    body: {
      contents: [{ role: "user", parts: [{ text: "Hi! How are you?" }] }],
    },
  });

  let content = "";
  for await (const event of response) {
    const text = event.candidates[0]?.content.parts[0]?.text;
    if (text !== undefined) {
      process.stdout.write(text);
      content += text;
    }

    if (event.candidates[0]?.finishReason === "STOP") {
      process.stdout.write("\n");
      break;
    }
  }

  console.log(content);

  const tokens = await countTokens({
    location: "us-central1",
    projectId: "lithdew",
    model: "gemini-1.5-flash",
    body: {
      contents: [{ role: "user", parts: [{ text: "Hi! How are you?" }] }],
    },
  });

  console.info(tokens.totalTokens);
}
