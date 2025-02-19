export default async function handler({
  url,
}: {
  req: Request;
  url: URL;
}): Promise<Response | undefined> {
  if (url.pathname === "/hello") {
    return new Response("Hello world");
  }
  return undefined;
}
