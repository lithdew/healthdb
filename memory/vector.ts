import Dexie, { type EntityTable } from "dexie";
import { cosineSimilarity, HNSW, Node } from "../hnsw/hnsw";
import type { Embedding, EmbeddingResult, VectorStore } from "./types";

export class HNSWVectorStore implements VectorStore {
  hnsw: HNSW;
  dexie: Dexie & {
    hnswStore: EntityTable<Node, "id">;
  };

  constructor(dexieDbName: string) {
    this.hnsw = new HNSW({
      efConstruction: 200,
      M: 16,
      d: 5,
      metric: cosineSimilarity,
    });
    this.dexie = new Dexie(dexieDbName) as Dexie & {
      hnswStore: EntityTable<Node, "id">;
    };
    this.dexie.version(1).stores({
      friends: "++id, level, vector, numbers", // primary key "id" (for the runtime!)
    });
  }

  get(id: number): EmbeddingResult | null {
    const node = this.hnsw.nodes.get(Number(id));
    if (node === undefined) {
      return null;
    }
    return { id: node.id, vector: Array.from(node.vector) };
  }

  add(embeddings: EmbeddingResult[]): EmbeddingResult[] {
    for (const embedding of embeddings) {
      this.hnsw.add(embedding.id, embedding.vector);
    }
    return embeddings;
  }

  update(embedding: { id: number; vector: Embedding }): EmbeddingResult {
    const node = this.hnsw.nodes.get(embedding.id);
    if (node === undefined) {
      throw new Error("Node not found");
    }
    node.vector = embedding.vector;

    return { id: node.id, vector: Array.from(node.vector) };
  }

  delete(id: number): void {
    this.hnsw.nodes.delete(id);
  }

  search(
    embedding: Embedding,
    opts?: { threshold?: number; topK?: number },
  ): EmbeddingResult[] {
    const { threshold, topK = 10 } = opts ?? {};
    const nodes = this.hnsw.search(embedding, topK);
    if (threshold !== undefined) {
      return nodes.filter((node) => node.similarity > threshold);
    }
    return nodes;
  }

  list(props?: { cursor?: string; limit?: number }): EmbeddingResult[] {
    throw new Error("Method not implemented.");
  }

  async save() {
    this.dexie.version(1).stores({
      hnswStore: "key,value", // 'key' and 'value' are indexed properties
    });
    await this.dexie.open();
    this.dexie.hnswStore.bulkPut(Array.from(this.hnsw.nodes.values()));
  }

  async load() {
    await this.dexie.open();
    const nodes = await this.dexie.hnswStore.toArray();
    for (const node of nodes) {
      this.hnsw.add(node.id, node.vector);
    }
  }
}
