import { z } from "zod";
import {
  type Embedding,
  type VectorStore,
  type EmbeddingResult,
} from "./types";
import { Embedder } from "./embedder";
import { Database } from "@sqlite.org/sqlite-wasm";
import { UpdateMemoryAction } from "../ai/prompts";
import { getRetrieveFactsPrompt, getUpdateMemoryPrompt } from "../ai/functions";
import { HNSWVectorStore } from "./vector";
import type { AskWithGeminiBody, GeminiEvent } from "../ai/google";
import { createParser } from "eventsource-parser";
import { initializeSQLite } from "../db";

export interface Memory {
  id: number;
  content: string;
  vector: Embedding;
  createdAt: number;
  updatedAt?: number;
}

interface DBMemory {
  id: number;
  content: string;
  created_at: number;
  updated_at?: number;
}

export class MemoryStore {
  private vector: VectorStore;
  private db: Database;
  private embedder: Embedder;

  constructor({
    vector,
    embedder,
    db,
  }: {
    vector: VectorStore;
    embedder: Embedder;
    db: Database;
  }) {
    this.vector = vector;
    this.embedder = embedder;
    this.db = db;
  }

  async *askWithGemini(body: AskWithGeminiBody) {
    const response = await fetch("http://localhost:8080/ask", {
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

        // @ts-expect-error
        for await (const chunk of stream) {
          parser.feed(chunk);
        }

        controller.close();
      },
    });

    // @ts-expect-error
    for await (const chunk of readable) {
      const event = chunk as GeminiEvent;

      yield event;

      if (event.candidates[0]?.finishReason === "STOP") {
        break;
      }
    }
  }

  async readAll(response: AsyncGenerator<GeminiEvent, void, unknown>) {
    let content = "";
    for await (const chunk of response) {
      const text = chunk.candidates[0]?.content.parts[0]?.text;
      if (text !== undefined) {
        content += text;
      }
    }

    return content;
  }

  async getMemory(id: number): Promise<Memory | null> {
    const embedding = this.vector.get(id);
    if (embedding === null) {
      return null;
    }

    const [memory] = this.db.exec(`SELECT * FROM memories WHERE id = $id`, {
      bind: { $id: id },
      returnValue: "resultRows",
      rowMode: "object",
    }) as unknown as DBMemory[];

    if (memory === undefined) {
      return null;
    }
    return {
      ...memory,
      vector: embedding.vector,
      createdAt: memory.created_at,
      updatedAt: memory.updated_at,
    };
  }

  async updateMemory({
    memoryId,
    content,
    vector,
  }: {
    memoryId: number;
    content: string;
    vector?: Embedding;
    metadata?: Record<string, any>;
  }) {
    const existingMemory = this.vector.get(memoryId);
    if (!existingMemory) {
      return null;
    }

    if (vector === undefined) {
      vector = (await this.embedder.embed([content]))[0];
      if (vector === undefined) throw new Error("failed to embed");
    }

    const [memory] = this.db.exec(
      "UPDATE memories SET content = $content, SET updated_at = $updated_at WHERE id = $id returning *",
      {
        bind: { $content: content, $id: memoryId, $updated_at: Date.now() },
        returnValue: "resultRows",
        rowMode: "object",
      },
    ) as unknown as DBMemory[];

    this.vector.update({
      id: memoryId,
      vector,
    });

    return {
      ...memory,
      vector,
      createdAt: memory.created_at,
      updatedAt: memory.updated_at,
    };
  }

  async deleteMemory(id: number) {
    this.vector.delete(id);
    this.db.exec("DELETE FROM memories WHERE id = $id", {
      bind: { $id: id },
    });
  }

  async readAllAndValidate<TSchema extends z.ZodTypeAny>(
    response: AsyncGenerator<GeminiEvent, void, unknown>,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const content = await this.readAll(response);
    return schema.parse(JSON.parse(content));
  }

  private async addMemory({
    content,
    existingEmbeddings,
  }: {
    content: string;
    existingEmbeddings: Record<string, Embedding>;
  }) {
    const embeddings =
      content in existingEmbeddings
        ? existingEmbeddings[content]
        : (await this.embedder.embed([content]))[0];

    const res = this.db.exec(
      `INSERT INTO memories (content) VALUES ($content) RETURNING id, created_at`,
      { bind: { $content: content }, returnValue: "resultRows" },
    );
    const id = res.at(0)?.at(0) as number;
    const createdAt = res.at(0)?.at(1) as number;
    if (!id) throw new Error("Failed to insert into db");
    this.vector.add([{ vector: embeddings, id }]);
    return { id, content, vector: embeddings, createdAt };
  }

  async search(content: string): Promise<EmbeddingResult[]> {
    const [embedding] = await this.embedder.embed([content]);
    return this.vector.search(embedding);
  }

  async add(content: string): Promise<Memory[]> {
    const retrieveFacts = getRetrieveFactsPrompt(content);
    let response = this.askWithGemini(retrieveFacts.body);
    const newRetrievedFacts = await this.readAllAndValidate(
      response,
      retrieveFacts.schema,
    );

    const newMessageEmbeddings: Record<string, Embedding> = {};
    const retrievedOldMemories: Memory[] = [];
    for (const fact of newRetrievedFacts.facts) {
      const [factEmbedding] = await this.embedder.embed([fact]);
      newMessageEmbeddings[fact] = factEmbedding;
      const relatedEmbeddings = this.vector.search(factEmbedding);
      const memories = relatedEmbeddings.length
        ? (this.db.exec(
            `SELECT * FROM memories WHERE id in [${relatedEmbeddings.map((v) => v.id).join("\n")}]`,
            { returnValue: "resultRows", rowMode: "object" },
          ) as unknown as Omit<Memory, "vector">[])
        : [];
      for (const memory of memories) {
        const vector = relatedEmbeddings.find(
          (v) => v.id === memory.id,
        )?.vector;
        if (vector === undefined) {
          throw new Error(
            `unexpected error here: ${memory}, ${relatedEmbeddings}`,
          );
        }
        retrievedOldMemories.push({
          ...memory,
          vector,
        });
      }
    }

    const tempIdMappings: Map<number, number> = new Map();
    // make ids easier for the llm to understand with auto-incremented integers, so no hallucination
    retrievedOldMemories.forEach((memory, i) => {
      tempIdMappings.set(i, memory.id);
      retrievedOldMemories[i].id = i;
    });

    const updateMemoryPrompt = getUpdateMemoryPrompt(
      retrievedOldMemories,
      newRetrievedFacts.facts,
    );

    response = this.askWithGemini(updateMemoryPrompt.body);
    const newMemoriesWithActions = await this.readAllAndValidate(
      response,
      updateMemoryPrompt.schema,
    );

    const returnedMemories: Memory[] = [];

    console.info({ newMemoriesWithActions, tempIdMappings });
    for (const action of newMemoriesWithActions.actions) {
      console.info(action);
      console.info({
        actual: { ...action, id: tempIdMappings.get(action.id)! },
      });
      const memoryId = tempIdMappings.get(action.id);
      if (memoryId === undefined) {
        throw new Error("hallucation happened, the ids are unsynced");
      }
      switch (action.action) {
        case UpdateMemoryAction.ADD: {
          console.info("adding memory");
          const memory = await this.addMemory({
            content: action.text,
            existingEmbeddings: newMessageEmbeddings,
          });
          console.info("added");
          console.info(memory);
          returnedMemories.push(memory);
          continue;
        }
        case UpdateMemoryAction.UPDATE: {
          const memoryId = tempIdMappings.get(action.id);
          if (memoryId === undefined) {
            throw new Error("hallucation happened, the ids are unsynced");
          }
          console.info("updating memory", {
            memoryId,
            content: action.text,
            existingEmbeddings: newMessageEmbeddings,
          });
          const memory = await this.updateMemory({
            memoryId,
            content: action.text,
            vector: newMessageEmbeddings[action.text],
          });
          if (memory === null) {
            throw new Error("Memory not found");
          }
          console.info("updated memory", memory);
          returnedMemories.push(memory);
          continue;
        }
        case UpdateMemoryAction.DELETE: {
          const memoryId = tempIdMappings.get(action.id);
          if (memoryId === undefined) {
            throw new Error("hallucation happened, the ids are unsynced");
          }
          await this.deleteMemory(memoryId);
          continue;
        }
        case UpdateMemoryAction.NONE: {
          continue;
        }
      }
    }

    return returnedMemories;
  }

  list(props?: { offset: number; limit: number }) {
    return this.vector.list(props);
  }
}

if (import.meta.env) {
  const embedder = new Embedder();
  const vector = new HNSWVectorStore("hnsw-db", 384);
  const db = await initializeSQLite();
  const memory = new MemoryStore({ vector, db, embedder });
}
