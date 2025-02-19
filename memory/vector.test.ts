import { describe, expect, test } from "bun:test";
import { HNSWVectorStore } from "./vector";
import { Embedder } from "./embedder";
describe("vectordb", async () => {
  const vector = new HNSWVectorStore("hnsw-db", 384);
  const embedder = new Embedder();
  const embeddings = await embedder.embed([
    "Hello, i love chocolates",
    "Hello, i love monkeys",
  ]);

  vector.add(embeddings.map((vector, i) => ({ id: i, vector })));
  const [embedding] = await embedder.embed(["i love choco"]);
  const results = vector.search(embedding, { threshold: 0.4 });

  test("should find record 0", () => {
    expect(results[0].id).toBe(0);
  });

  // bun doesnt have indexdb
  // test("should be able to save", async () => {
  //   await vector.save();
  // });
  //
  // test("should be able to clear nodes", async () => {
  //   await vector.clear();
  //   expect(vector.hnsw.nodes.size).toBe(0);
  // });
  //
  // test("should be able to load nodes", async () => {
  //   await vector.load();
  //   expect(vector.hnsw.nodes.size).toBe(2);
  // });
});
