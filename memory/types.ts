/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

export type Embedding = number[] | Float32Array;

export interface EmbeddingResult {
  id: number;
  vector: Embedding;
}

type UpdateableEmbeddingResult = Omit<
  EmbeddingResult,
  "createdAt" | "updatedAt"
>;

export interface VectorStore {
  get(id: number): EmbeddingResult | null;
  add(embeddings: EmbeddingResult[]): EmbeddingResult[];
  update(embedding: UpdateableEmbeddingResult): EmbeddingResult;
  delete(id: number): void;
  // returns records sorted by relevance
  search(
    embedding: Embedding,
    opts?: { threshold?: number; topK?: number }
  ): EmbeddingResult[];
  list(props?: { cursor?: string; limit?: number }): Promise<EmbeddingResult[]>;
}

export interface LLM {
  generate<Schema extends z.ZodTypeAny>(prompt: {
    system?: string;
    user: string;
    schema: Schema;
    model?: any;
  }): Promise<z.infer<Schema>>;
  generate(prompt: {
    system?: string;
    user: string;
    model?: any;
  }): Promise<string>;
  summarize(conversations: string[]): Promise<string>;
}

export interface Database {
  exec<T>(query: string): T;
}
