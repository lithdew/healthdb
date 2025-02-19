import { z } from "zod";
export const geminiContentSchema = z.object({
  role: z.enum(["user", "model"]),
  parts: z.array(z.object({ text: z.string() })),
});

export const geminiEventSchema = z.object({
  candidates: z.tuple([]).or(
    z.tuple([
      z.object({
        content: geminiContentSchema,
        finishReason: z.enum(["STOP"]).optional(),
      }),
    ]),
  ),
  usageMetadata: z.object({
    promptTokenCount: z.number(),
    candidatesTokenCount: z.number(),
    totalTokenCount: z.number(),
    promptTokensDetails: z.array(
      z.object({
        modality: z.enum(["TEXT", "IMAGE"]),
        tokenCount: z.number(),
      }),
    ),
    candidatesTokensDetails: z.array(
      z.object({
        modality: z.enum(["TEXT", "IMAGE"]),
        tokenCount: z.number(),
      }),
    ),
    modelVersion: z.string(),
    createTime: z.string(),
    responseId: z.string(),
  }),
});

const geminiToolSchema = z.object({
  functionDeclarations: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.instanceof(z.Schema).or(z.unknown()),
      }),
    )
    .optional(),
  googleSearchRetrieval: z
    .object({
      mode: z.enum(["MODE_UNSPECIFIED", "MODE_DYNAMIC"]),
      dynamicThreshold: z.number(),
    })
    .optional(),
  googleSearch: z.object({}).optional(),
});

const geminiToolConfigSchema = z.object({
  functionCallingConfig: z
    .object({
      mode: z.enum(["AUTO", "ANY", "NONE"]),
      allowedFunctionNames: z.array(z.string()),
    })
    .optional(),
});

const geminiGenerationConfigSchema = z.object({
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  candidateCount: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  seed: z.number().optional(),
  responseMimeType: z.enum(["application/json", "text/plain"]).optional(),
  responseSchema: z.any().optional(),
});

export const askWithGeminiBodySchema = z.object({
  contents: geminiContentSchema.array(),
  systemInstruction: geminiContentSchema.optional(),
  tools: z.array(geminiToolSchema).optional(),
  toolConfig: geminiToolConfigSchema.optional(),
  generationConfig: geminiGenerationConfigSchema.optional(),
});

export const askWithGeminiParamsSchema = z.object({
  location: z.literal("us-central1"),
  projectId: z.string(),
  model: z.enum(["gemini-1.5-flash", "gemini-2.0-flash"]),
  body: askWithGeminiBodySchema,
});

export const geminiCountTokensResponse = z
  .object({
    totalTokens: z.number(),
    totalBillableCharacters: z.number(),
    promptTokensDetails: z.array(
      z.object({
        modality: z.enum(["TEXT", "IMAGE"]),
        tokenCount: z.number(),
      })
    ),
  })
  .passthrough();

export type GeminiContent = z.output<typeof geminiContentSchema>;

export type GeminiEvent = z.output<typeof geminiEventSchema>;

export type AskWithGeminiParams = z.output<typeof askWithGeminiParamsSchema>;

export type AskWithGeminiBody = z.output<typeof askWithGeminiBodySchema>;

export type GeminiCountTokensResponse = z.output<
  typeof geminiCountTokensResponse
>;
