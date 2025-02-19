import type { DB } from "../db";
import { cosineSimilarity, HNSW } from "../hnsw/hnsw";
import type { Embedding, EmbeddingResult, VectorStore } from "./types";

export class HNSWVectorStore implements VectorStore {
  hnsw: HNSW;
  db: DB;
  changed: boolean = false;

  constructor(db: DB, dimension: number) {
    this.db = db;
    this.hnsw = new HNSW({
      efConstruction: 200,
      M: 16,
      d: dimension,
      metric: cosineSimilarity,
    });
    setInterval(() => {
      if (this.changed) {
        this.save();
        this.changed = false;
      }
    }, 5000);
  }

  get(id: number): EmbeddingResult | null {
    const node = this.hnsw.nodes.get(Number(id));
    if (node === undefined) {
      return null;
    }
    return { id: node.id, vector: Array.from(node.vector) };
  }

  add(embeddings: EmbeddingResult[]): EmbeddingResult[] {
    this.changed = true;
    for (const embedding of embeddings) {
      this.hnsw.add(embedding.id, embedding.vector);
    }
    return embeddings;
  }

  update(embedding: { id: number; vector: Embedding }): EmbeddingResult {
    this.changed = true;
    const node = this.hnsw.nodes.get(embedding.id);
    if (node === undefined) {
      throw new Error("Node not found");
    }
    node.vector = embedding.vector;

    return { id: node.id, vector: Array.from(node.vector) };
  }

  delete(id: number): void {
    this.changed = true;
    this.hnsw.nodes.delete(id);
  }

  search(
    embedding: Embedding,
    opts?: { threshold?: number; topK?: number },
  ): EmbeddingResult[] {
    const { threshold, topK = 10 } = opts ?? {};
    if (this.hnsw.nodes.size === 0) {
      return [];
    }
    const nodes = this.hnsw.search(embedding, topK);
    if (threshold !== undefined) {
      return nodes.filter((node) => node.similarity > threshold);
    }
    return nodes;
  }

  async list(): Promise<EmbeddingResult[]> {
    const items = await this.db.hnswNodes.toArray();
    return items.map((i) => ({ id: i.id, vector: i.vector }));
  }

  async save() {
    this.db.hnswNodes.bulkPut(Array.from(this.hnsw.nodes.values()));
  }

  async load() {
    await this.db.open();
    const nodes = await this.db.hnswNodes.toArray();
    for (const node of nodes) {
      this.hnsw.add(node.id, node.vector);
    }
  }

  async clear() {
    this.hnsw.nodes = new Map();
    // await this.dexie.delete();
  }
}
