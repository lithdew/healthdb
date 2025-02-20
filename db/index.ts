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
  parentMessageId: string;
  id: string;
  depth: number;
  history: { role: "model" | "user"; text: string }[];
  children: string[];
  status: "generating" | "completed";
  events: GeminiEvent[];
  buffer: string;
  createdAt: number;
  score?: number;
}

interface Message {
  id: string;
  role: "model" | "user";
  text: string;
  createdAt: number;
}

export interface DexieSchema {
  hnswNodes: EntityTable<Node, "id">;
  measurements: EntityTable<Measurement, "id">;
  conversations: EntityTable<Conversation, "id">;
  memories: EntityTable<Memory, "id">;
  events: EntityTable<Event, "id">;
  researchNodes: EntityTable<ResearchNode, "id">;
  messages: EntityTable<Message, "id">;
}
