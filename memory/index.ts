import { z } from "zod";
import {
  type Embedding,
  type VectorStore,
  type EmbeddingResult,
} from "./types";
import { Embedder } from "./embedder";
import { UpdateMemoryAction } from "../ai/prompts";
import { getRetrieveFactsPrompt, getUpdateMemoryPrompt } from "../ai/functions";
import { HNSWVectorStore } from "./vector";
import { createParser } from "eventsource-parser";
import type { AskWithGeminiBody, GeminiEvent } from "../ai/gemini";
import { createDatabase, type DB } from "../db";

export interface Memory {
  id: number;
  content: string;
  vector: Embedding;
  createdAt: number;
  updatedAt?: number;
}

export class MemoryStore {
  private vector: HNSWVectorStore;
  private db: DB;
  private embedder: Embedder;

  constructor({
    vector,
    embedder,
    db,
  }: {
    vector: HNSWVectorStore;
    embedder: Embedder;
    db: DB;
  }) {
    this.vector = vector;
    this.embedder = embedder;
    this.db = db;
  }

  async *askWithGemini(body: AskWithGeminiBody) {
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

    const memory = await this.db.memories.get(id);

    if (memory === undefined) {
      return null;
    }
    return {
      ...memory,
      vector: embedding.vector,
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
  }) {
    const existingMemory = this.vector.get(memoryId);
    const dbMemory = await this.db.memories.get(memoryId);
    if (existingMemory === null || dbMemory === undefined) {
      return null;
    }

    if (vector === undefined) {
      vector = (await this.embedder.embed([content]))[0];
      if (vector === undefined) throw new Error("failed to embed");
    }

    const updatedAt = Date.now();

    await this.db.memories.update(memoryId, {
      content,
      updatedAt,
    });

    this.vector.update({
      id: memoryId,
      vector,
    });

    return {
      ...existingMemory,
      ...dbMemory,
      vector,
      updatedAt,
      content,
    };
  }

  async deleteMemory(id: number) {
    this.vector.delete(id);
    await this.db.memories.delete(id);
  }

  async readAllAndValidate<TSchema extends z.ZodTypeAny>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: AsyncGenerator<GeminiEvent, any, unknown>,
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

    const createdAt = new Date().getTime();

    const id = await this.db.memories.add({
      content,
      createdAt,
    });

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
        ? await this.db.memories.bulkGet(relatedEmbeddings.map((v) => v.id))
        : [];
      for (const memory of memories.filter((m) => m !== undefined)) {
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

  async list(props?: { offset: number; limit: number }) {
    const memories = await this.db.memories.toArray();
    const embeddings = this.vector.list();
  }
}

export const createMemoryStore = async () => {
  const embedder = new Embedder();
  const db = await createDatabase();
  const vector = new HNSWVectorStore(db, 384);
  const memory = new MemoryStore({ vector, embedder, db });
  return memory;
};
