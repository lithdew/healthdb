import { z } from "zod";
import {
  askWithGeminiBodySchema,
  type AskWithGeminiBody,
  type AskWithGeminiParams,
} from "./ai/gemini";
import { askWithGemini, countTokens } from "./ai/google";
import { Database } from "bun:sqlite";
import { outdent } from "outdent";
import stringify from "@solana/fast-stable-stringify";
import { encode } from "eventsource-encoder";

const db = new Database("db.sqlite", {
  strict: true,
  safeIntegers: true,
  create: true,
});

db.exec(`pragma foreign_keys = true`);
db.exec(`pragma journal_mode = WAL`);
db.exec(`pragma synchronous = NORMAL`);

db.exec(outdent`
  create table if not exists token_count_cache(
    key text primary key not null,
    value text
  );
`);

export default async function handler({
  req,
  url,
}: {
  req: Request;
  url: URL;
}): Promise<Response | undefined> {
  if (req.method === "POST" && url.pathname === "/ask") {
    const result = askWithGeminiBodySchema
      .merge(
        z.object({
          model: z
            .enum(["gemini-1.5-flash", "gemini-2.0-flash"])
            .optional()
            .default("gemini-1.5-flash"),
        })
      )
      .safeParse(await req.json());
    if (!result.success) {
      return Response.json(result.error, {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(
      // @ts-expect-error - This is a valid async generator function
      async function* () {
        for await (const event of askWithGemini({
          location: "us-central1",
          projectId: "lithdew",
          model: result.data.model,
          body: result.data,
        })) {
          yield encode({ data: JSON.stringify(event) });
        }
      },
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      }
    );
  }

  if (req.method === "POST" && url.pathname === "/tokens") {
    const result = askWithGeminiBodySchema
      .merge(
        z.object({
          model: z
            .enum(["gemini-1.5-flash", "gemini-2.0-flash"])
            .optional()
            .default("gemini-1.5-flash"),
        })
      )
      .safeParse(await req.json());
    if (!result.success) {
      return Response.json(result.error, {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const response = await getTokenCount(result.data.model, result.data);

    return Response.json(response, {
      headers: { "Content-Type": "application/json" },
    });
  }

  return undefined;
}

async function getTokenCount(
  model: AskWithGeminiParams["model"],
  body: AskWithGeminiBody
) {
  const key = stringify(body);
  const cached = db
    .query<{ value: string }, [string]>(
      "select value from token_count_cache where key = ?"
    )
    .get(key);
  if (cached !== null) {
    return JSON.parse(cached.value);
  }

  const response = await countTokens({
    location: "us-central1",
    projectId: "lithdew",
    model,
    body,
  });

  db.query(
    "insert or replace into token_count_cache (key, value) values (?, ?)"
  ).run(key, JSON.stringify(response));

  return response;
}
