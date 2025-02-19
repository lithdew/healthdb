import { pipeline, env } from "@xenova/transformers";
env.allowLocalModels = false;

const pipePromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

export class Embedder {
  async embed(contents: string[]) {
    return Promise.all(
      contents.map(async (content) => {
        const pipe = await pipePromise;
        const output = await pipe(content, {
          pooling: "mean",
          normalize: true,
        });
        return Array.from(output.data) as number[];
      }),
    );
  }
}
