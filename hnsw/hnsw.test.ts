import { describe, expect, test } from "bun:test";
import { cosineSimilarity, HNSW } from "./hnsw";

test("it works", () => {
  const index = new HNSW({
    efConstruction: 200,
    M: 16,
    d: 5,
    metric: cosineSimilarity,
  });

  const data = [
    { id: 1, vector: [1, 2, 3, 4, 5] },
    { id: 2, vector: [2, 3, 4, 5, 6] },
    { id: 3, vector: [3, 4, 5, 6, 7] },
    { id: 4, vector: [4, 5, 6, 7, 8] },
    { id: 5, vector: [5, 6, 7, 8, 9] },
  ];

  for (const row of data) {
    index.add(row.id, row.vector);
  }

  const results = index.search([6, 7, 8, 9, 10], 2);

  expect(results).toEqual([
    {
      id: 1,
      similarity: 0.9649505047327671,
      vector: [1, 2, 3, 4, 5],
    },
    {
      id: 2,
      similarity: 0.9864400504156211,
      vector: [2, 3, 4, 5, 6],
    },
  ]);
});
