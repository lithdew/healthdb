import { Dexie, type EntityTable } from "dexie";
import { Node } from "../hnsw/hnsw";
import type { AskWithGeminiBody, GeminiEvent } from "../ai/gemini";

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

interface Tables {
  hnswNodes: EntityTable<Node, "id">;
  measurements: EntityTable<Measurement, "id">;
  conversations: EntityTable<Conversation, "id">;
  memories: EntityTable<Memory, "id">;
  events: EntityTable<Event, "id">;
}

export type DB = Dexie & Tables;

let db: DB | null = null;

export async function createDatabase() {
  if (db !== null) return db;
  db = new Dexie("my-db") as DB;
  db.version(1).stores({
    hnswNodes: "++id",
    measurements: "++id",
    conversations: "++id",
    memories: "++id",
    events: "++id",
  });

  await db.open();
  return db;
}
