import { type EntityTable } from "dexie";
import type { AskWithGeminiBody, GeminiEvent } from "../ai/gemini";
import { Node } from "../hnsw/hnsw";

interface Measurement {
  id: number;
  type: string;
  unit: string;
  value: string;
  createdAt: number;
}

interface Conversation {
  id: string;
  question: string;
  response: string;
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

interface ResearchNode {
  id: string;
  depth: number;
  messageId: string;
  parentId?: string;
  history: { role: "model" | "user"; text: string }[];
  children: string[];
  status: "generating" | "completed";
  events: GeminiEvent[];
  buffer: string;
  createdAt: number;
  score?: number;
}

export interface DexieSchema {
  hnswNodes: EntityTable<Node, "id">;
  measurements: EntityTable<Measurement, "id">;
  conversations: EntityTable<Conversation, "id">;
  memories: EntityTable<Memory, "id">;
  events: EntityTable<Event, "id">;
  researchNodes: EntityTable<ResearchNode, "id">;
}
