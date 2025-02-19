import {
  EXTRACT_MEASUREMENT_PROMPT,
  FACT_RETRIEVAL_PROMPT,
  getUpdateMemoryPrompt,
  SUMMARIZE_CONVERSATION_PROMPT,
  UpdateMemoryAction,
} from "./prompts";
import config from "../service_account.json";
import { askWithGemini, readAllAndValidate } from "./google";
import { z } from "zod";

type Model = "gemini-1.5-flash" | "gemini-2.0-flash";

const getParams = (model: Model) =>
  ({
    location: "us-central1",
    projectId: config.project_id,
    model,
  }) as const;

export async function retrieveFactsPrompt(text: string) {
  const params = getParams("gemini-2.0-flash");
  const responseSchema = z.object({
    facts: z.array(z.string()),
  });
  const response = askWithGemini({
    ...params,
    body: {
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: FACT_RETRIEVAL_PROMPT.replace(
              "{DATE_TODAY}",
              new Date().toDateString(),
            ),
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    },
  });
  const result = await readAllAndValidate(response, responseSchema);
  return result.facts;
}

export async function extractMeasurementsPrompt(text: string) {
  const params = getParams("gemini-2.0-flash");
  const responseSchema = z.object({
    measurements: z.array(
      z.object({
        type: z.string(),
        unit: z.string(),
        value: z.string(),
        timestamp: z.string().describe("ISO 8601 date-time string").nullable(),
      }),
    ),
  });
  const response = askWithGemini({
    ...params,
    body: {
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: EXTRACT_MEASUREMENT_PROMPT,
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                text,
                `Current system clock: ${new Date().toISOString()}`,
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    },
  });

  const result = await readAllAndValidate(response, responseSchema);
  return result.measurements;
}

export function summarizeConversationPrompt(conversations: string[]) {
  const params = getParams("gemini-2.0-flash");
  return askWithGemini({
    ...params,
    body: {
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: SUMMARIZE_CONVERSATION_PROMPT,
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: conversations.join("\n") }] }],
    },
  });
}

export async function updateMemoryPrompt(
  oldMemory: { id: string; text: string }[],
  newRetrievedFacts: string[],
) {
  const params = getParams("gemini-2.0-flash");
  const updateMemorySchema = z.object({
    actions: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        action: z.enum([
          UpdateMemoryAction.ADD,
          UpdateMemoryAction.UPDATE,
          UpdateMemoryAction.DELETE,
          UpdateMemoryAction.NONE,
        ]),
      }),
    ),
  });
  const { system, user } = getUpdateMemoryPrompt({
    oldMemory,
    newRetrievedFacts,
  });
  const response = askWithGemini({
    ...params,
    body: {
      systemInstruction: {
        role: "system",
        parts: [{ text: system }],
      },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: updateMemorySchema,
      },
    },
  });
  const result = await readAllAndValidate(response, updateMemorySchema);
  return result.actions;
}

if (import.meta.env) {
  const measurements = await extractMeasurementsPrompt(
    "my heart rate was going crazy yesterday, i feel like i cant breath, i measured it around 250bpm, my blood pressure was 180/120",
  );
  console.info(measurements);
}
