import { expect, test } from "bun:test";
import { Embedder } from "./embedder";

test("embedding works", async () => {
  const embedder = new Embedder();
  const embeddings = await embedder.embed(["Hello, i love chocolates"]);
  expect(embeddings).toHaveLength(1);
});
