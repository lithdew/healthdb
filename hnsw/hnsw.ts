// based on deepfates/hnsw

import FastPriorityQueue from "fastpriorityqueue";

export class Node {
  id: number;
  level: number;
  vector: Float32Array | number[];
  neighbors: number[][];

  constructor(
    id: number,
    vector: Float32Array | number[],
    level: number,
    M: number,
  ) {
    this.id = id;
    this.vector = vector;
    this.level = level;
    this.neighbors = Array.from({ length: level + 1 }, () =>
      new Array(M).fill(-1),
    );
  }
}

interface PriorityQueue<T> {
  push(item: T): void;
  pop(): T | undefined;
  isEmpty(): boolean;
}

class LemirePriorityQueue<T> implements PriorityQueue<T> {
  private inner: FastPriorityQueue<T>;

  constructor(comparator: (a: T, b: T) => boolean) {
    this.inner = new FastPriorityQueue(comparator);
  }

  push(item: T): void {
    this.inner.add(item);
  }

  pop(): T | undefined {
    return this.inner.poll();
  }

  isEmpty(): boolean {
    return this.inner.isEmpty();
  }
}

export function dotProduct(
  a: Float32Array | number[],
  b: Float32Array | number[],
) {
  let dp = 0.0;
  for (let i = 0; i < a.length; i++) {
    dp += a[i] * b[i];
  }
  return dp;
}

export function magnitude(a: Float32Array | number[]) {
  let mag = 0.0;
  for (let i = 0; i < a.length; i++) {
    mag += a[i] * a[i];
  }
  return Math.sqrt(mag);
}

export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[],
) {
  return dotProduct(a, b) / (magnitude(a) * magnitude(b));
}

export class HNSW {
  metric: (a: number[] | Float32Array, b: number[] | Float32Array) => number;
  d: number | null = null; // Dimension of vectors.
  M: number; // Maximum number of neighbors.
  efConstruction: number; // Number of layers to construct.
  levelMax: number; // Maximum level of the graph.
  entrypointId: number; // Entrypoint ID.
  nodes: Map<number, Node>;
  probs: number[];

  constructor(
    props: {
      metric: (
        a: number[] | Float32Array,
        b: number[] | Float32Array,
      ) => number;
      M: number;
      efConstruction: number;
      d: number | null;
    } = {
      M: 16,
      efConstruction: 200,
      d: null,
      metric: cosineSimilarity,
    },
  ) {
    this.metric = props.metric;
    this.d = props.d;
    this.M = props.M;
    this.efConstruction = props.efConstruction;
    this.entrypointId = -1;
    this.nodes = new Map();
    this.probs = this.setProbabilities(this.M, 1 / Math.log(this.M)); // M / log10(M)
    this.levelMax = this.probs.length - 1;
  }

  private setProbabilities(M: number, levelMult: number) {
    let level = 0;

    const probs = [];
    while (true) {
      const p = Math.exp(-level / levelMult) * (1 - Math.exp(-1 / levelMult));
      if (p < 1e-9) {
        break;
      }

      probs.push(p);
      level++;
    }
    return probs;
  }

  // Weighted random selection of level.
  private selectLevel() {
    let r = Math.random();
    for (const p of this.probs) {
      if (r < p) {
        continue;
      }
      r -= p;
    }
    return this.probs.length - 1;
  }

  private addNodeToGraph(node: Node) {
    if (this.entrypointId === -1) {
      this.entrypointId = node.id;
      return;
    }

    let current = this.nodes.get(this.entrypointId)!;
    let closest = current;

    for (let level = this.levelMax; level >= 0; level--) {
      while (true) {
        let next = null;
        let max = -Infinity;

        for (const neighborId of current.neighbors[level]) {
          if (neighborId === -1) break;

          const neighbor = this.nodes.get(neighborId)!;

          const similarity = this.metric(node.vector, neighbor.vector);
          if (similarity > max) {
            max = similarity;
            next = neighbor;
          }
        }

        if (next === null) {
          break;
        }

        if (max <= this.metric(node.vector, closest.vector)) {
          break;
        }

        closest = current = next;
      }
    }

    const closestLevel = Math.min(node.level, closest.level);
    for (let level = 0; level <= closestLevel; level++) {
      closest.neighbors[level] = closest.neighbors[level].filter(
        (id) => id !== -1,
      );
      closest.neighbors[level].push(node.id);
      if (closest.neighbors[level].length > this.M) {
        closest.neighbors[level].pop();
      }

      node.neighbors[level] = node.neighbors[level].filter((id) => id !== -1);
      node.neighbors[level].push(closest.id);
      if (node.neighbors[level].length > this.M) {
        node.neighbors[level].pop();
      }
    }
  }

  add(id: number, vector: Float32Array | number[]) {
    if (id === -1) {
      throw new Error("ID cannot be -1");
    }

    if (this.d !== null && vector.length !== this.d) {
      throw new Error("Vector dimension does not match");
    }

    this.d = vector.length;

    const node = new Node(id, vector, this.selectLevel(), this.M);
    this.nodes.set(id, node);
    this.levelMax = Math.max(this.levelMax, node.level);
    this.addNodeToGraph(node);
  }

  search(query: Float32Array | number[], k: number) {
    if (this.nodes.size === 1) {
      const entrypoint = this.nodes.get(this.entrypointId)!;
      const similarity = this.metric(query, entrypoint.vector);
      return [{ id: this.entrypointId, similarity, vector: entrypoint.vector }];
    }

    const results: {
      id: number;
      similarity: number;
      vector: Float32Array | number[];
    }[] = [];
    const visited = new Set<number>();

    const candidates = new LemirePriorityQueue<number>((a, b) => {
      const nodeA = this.nodes.get(a)!;
      const nodeB = this.nodes.get(b)!;
      return (
        this.metric(query, nodeB.vector) > this.metric(query, nodeA.vector)
      );
    });

    candidates.push(this.entrypointId);

    let level = this.levelMax;

    while (results.length < k) {
      const currentId = candidates.pop();
      if (currentId === undefined) {
        break;
      }

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const current = this.nodes.get(currentId)!;
      const similarity = this.metric(query, current.vector);

      if (similarity > 0) {
        results.push({ id: currentId, similarity, vector: current.vector });
      }

      if (current.level === 0) {
        continue;
      }

      level = Math.min(level, current.level - 1);

      for (let i = level; i >= 0; i--) {
        const neighbors = current.neighbors[i];
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            candidates.push(neighborId);
          }
        }
      }
    }

    return results.slice(0, k);
  }
}
