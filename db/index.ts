import { type EntityTable } from "dexie";
import type { AskWithGeminiBody, GeminiEvent } from "../ai/gemini";
import { Node } from "../hnsw/hnsw";

interface Measurement {
  id: number;
  type: string;
  unit: string;
  value: number;
  createdAt: number;
}

interface Conversation {
  id: number;
  content: string;
  createdAt: number;
}

interface Memory {
  id: number;
  content: string;
  createdAt: number;
  updatedAt?: number;
}

interface Event {
  id: number;
  requestBody: AskWithGeminiBody;
  timestamp: number;
  chunks: GeminiEvent["candidates"];
}

export interface DexieSchema {
  hnswNodes: EntityTable<Node, "id">;
  measurements: EntityTable<Measurement, "id">;
  conversations: EntityTable<Conversation, "id">;
  memories: EntityTable<Memory, "id">;
  events: EntityTable<Event, "id">;
}
