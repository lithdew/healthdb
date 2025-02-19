import { getRetrieveFactsPrompt, getUpdateMemoryPrompt } from "../ai/functions";
import { UpdateMemoryAction } from "../ai/prompts";
import { Embedder } from "./embedder";
import { type Embedding } from "./types";
import { HNSWVectorStore } from "./vector";
import type Dexie from "dexie";
import type { DexieSchema } from "../db";
import { askWithGemini, readAllAndValidate } from "../ai/gemini.client";

export interface Memory {
  id: number;
  content: string;
  vector: Embedding;
  createdAt: number;
  updatedAt?: number;
}

export class MemoryStore {
  private vector: HNSWVectorStore;
  private db: Dexie & DexieSchema;
  private embedder: Embedder;

  constructor({
    vector,
    embedder,
    db,
  }: {
    vector: HNSWVectorStore;
    embedder: Embedder;
    db: Dexie & DexieSchema;
  }) {
    this.vector = vector;
    this.embedder = embedder;
    this.db = db;
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
    console.info({ id });

    this.vector.add([{ vector: embeddings, id }]);
    return { id, content, vector: embeddings, createdAt };
  }

  async search(
    content: string,
    opts?: { threshold?: number },
  ): Promise<Memory[]> {
    const { threshold = 0.7 } = opts ?? {};
    const [embedding] = await this.embedder.embed([content]);
    const results = this.vector.search(embedding, { threshold });
    const memories = await this.db.memories.bulkGet(results.map((r) => r.id));
    return memories
      .filter((m) => m !== undefined)
      .map((m) => ({ ...m, vector: this.vector.get(m.id)!.vector }));
  }

  async add(content: string): Promise<Memory[]> {
    const retrieveFacts = getRetrieveFactsPrompt(content);
    let response = askWithGemini(retrieveFacts.body);
    const newRetrievedFacts = await readAllAndValidate(
      response,
      retrieveFacts.schema,
    );

    const newMessageEmbeddings: Record<string, Embedding> = {};
    const retrievedOldMemories: Memory[] = [];
    for (const fact of newRetrievedFacts.facts) {
      const [factEmbedding] = await this.embedder.embed([fact]);
      newMessageEmbeddings[fact] = factEmbedding;
      const relatedEmbeddings = this.vector.search(factEmbedding);
      console.info(relatedEmbeddings);
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
      retrievedOldMemories.map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
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
    return memories.map((m) => ({
      ...m,
      vector: this.vector.get(m.id)!.vector,
    }));
  }
}
