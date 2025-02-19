import { askWithGeminiBodySchema } from "./ai/gemini";
import { askWithGemini } from "./ai/google";

export default async function handler({
  req,
  url,
}: {
  req: Request;
  url: URL;
}): Promise<Response | undefined> {
  if (req.method === "POST" && url.pathname === "/ask") {
    const result = askWithGeminiBodySchema.safeParse(await req.json());
    if (!result.success) {
      return Response.json(result.error, {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    return new Response(
      // @ts-expect-error - This is a valid async generator function
      async function* () {
        for await (const event of askWithGemini({
          location: "us-central1",
          projectId: "lithdew",
          model: "gemini-1.5-flash",
          body: result.data,
        })) {
          yield JSON.stringify(event);
        }
      },
      { headers: { "Content-Type": "text/plain" } }
    );
  }
  return undefined;
}
