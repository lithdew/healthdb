import { zodToVertexSchema } from "@techery/zod-to-vertex-schema";
import {
  EXTRACT_MEASUREMENT_PROMPT,
  FACT_RETRIEVAL_PROMPT,
  SUMMARIZE_CONVERSATION_PROMPT,
  UpdateMemoryAction,
  updateMemoryPrompt,
} from "./prompts";
import { z } from "zod";

export function getRetrieveFactsPrompt(text: string) {
  const responseSchema = z.object({
    facts: z.array(z.string()),
  });

  return {
    schema: responseSchema,
    body: {
      systemInstruction: {
        role: "model" as const,
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
          role: "user" as const,
          parts: [{ text }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json" as const,
        responseSchema: zodToVertexSchema(responseSchema),
      },
    },
  };
}

export function getExtractMeasurementsPrompt(text: string) {
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
  return {
    schema: responseSchema,
    body: {
      systemInstruction: {
        role: "system" as const,
        parts: [
          {
            text: EXTRACT_MEASUREMENT_PROMPT,
          },
        ],
      },
      contents: [
        {
          role: "user" as const,
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
        responseMimeType: "application/json" as const,
        responseSchema: zodToVertexSchema(responseSchema),
      },
    },
  };
}

export function getSummarizeConversationPrompt(conversations: string[]) {
  return {
    body: {
      systemInstruction: {
        role: "model" as const,
        parts: [
          {
            text: SUMMARIZE_CONVERSATION_PROMPT,
          },
        ],
      },
      contents: [
        { role: "user" as const, parts: [{ text: conversations.join("\n") }] },
      ],
    },
  };
}

export function getUpdateMemoryPrompt(
  oldMemory: { id: number; content: string; createdAt: string }[],
  newRetrievedFacts: string[],
) {
  const responseSchema = z.object({
    actions: z.array(
      z.object({
        id: z.number(),
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
  const { system, user } = updateMemoryPrompt({
    oldMemory,
    newRetrievedFacts,
  });
  return {
    body: {
      systemInstruction: {
        role: "model" as const,
        parts: [{ text: system }],
      },
      contents: [{ role: "user" as const, parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json" as const,
        responseSchema: zodToVertexSchema(responseSchema),
      },
    },
    schema: responseSchema,
  };
}

if (import.meta.env) {
  // const measurements = await extractMeasurementsPrompt(
  //   "my heart rate was going crazy yesterday, i feel like i cant breath, i measured it around 250bpm, my blood pressure was 180/120",
  // );
  // console.info(measurements);
}
