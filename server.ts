/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { ServeOptions } from "bun";
import {
  IncomingMessage,
  type OutgoingHttpHeader,
  type OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import path from "node:path";
import process from "node:process";
import { PassThrough, Readable } from "node:stream";
import * as vite from "vite";

const statusCodesWithoutBody = [
  100, // Continue
  101, // Switching Protocols
  102, // Processing (WebDAV)
  103, // Early Hints
  204, // No Content
  205, // Reset Content
  304, // Not Modified
];

interface NextFunction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (err?: any): void;
  /**
   * "Break-out" of a router by calling {next('router')};
   * @see {https://expressjs.com/en/guide/using-middleware.html#middleware.router}
   */
  (deferToNext: "router"): void;
  /**
   * "Break-out" of a route by calling {next('route')};
   * @see {https://expressjs.com/en/guide/using-middleware.html#middleware.application}
   */
  (deferToNext: "route"): void;
}

type ConnectMiddleware<
  PlatformRequest extends IncomingMessage = IncomingMessage,
  PlatformResponse extends ServerResponse = ServerResponse
> = (
  req: PlatformRequest,
  res: PlatformResponse,
  next: NextFunction
) => void | Promise<void>;
type ConnectMiddlewareBoolean<
  PlatformRequest extends IncomingMessage = IncomingMessage,
  PlatformResponse extends ServerResponse = ServerResponse
> = (
  req: PlatformRequest,
  res: PlatformResponse,
  next: NextFunction
) => boolean | Promise<boolean>;

type WebHandler = (
  request: Request
) => Response | undefined | Promise<Response | undefined>;

function createServerResponse(incomingMessage: IncomingMessage): {
  res: ServerResponse;
  onReadable: (
    cb: (result: {
      readable: Readable;
      headers: OutgoingHttpHeaders;
      statusCode: number;
    }) => void
  ) => void;
} {
  const res = new ServerResponse(incomingMessage);
  const passThrough = new PassThrough();
  let handled = false;

  const onReadable = (
    cb: (result: {
      readable: Readable;
      headers: OutgoingHttpHeaders;
      statusCode: number;
    }) => void
  ) => {
    const handleReadable = () => {
      if (handled) return;
      handled = true;
      cb({
        readable: Readable.from(passThrough),
        headers: res.getHeaders(),
        statusCode: res.statusCode,
      });
    };

    passThrough.once("readable", handleReadable);
    passThrough.once("end", handleReadable);
  };

  passThrough.once("finish", () => {
    res.emit("finish");
  });
  passThrough.once("close", () => {
    res.destroy();
    res.emit("close");
  });
  passThrough.on("drain", () => {
    res.emit("drain");
  });

  res.write = passThrough.write.bind(passThrough);
  res.end = (passThrough as any).end.bind(passThrough);

  res.writeHead = function writeHead(
    statusCode: number,
    statusMessage?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]
  ): ServerResponse {
    res.statusCode = statusCode;
    if (typeof statusMessage === "object") {
      headers = statusMessage;
      statusMessage = undefined;
    }
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      });
    }
    return res;
  };

  return {
    res,
    onReadable,
  };
}

function flattenHeaders(headers: OutgoingHttpHeaders): [string, string][] {
  const flatHeaders: [string, string][] = [];

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((v) => {
        if (v != null) {
          flatHeaders.push([key, String(v)]);
        }
      });
    } else {
      flatHeaders.push([key, String(value)]);
    }
  }

  return flatHeaders;
}

function connectToWeb(
  handler: ConnectMiddleware | ConnectMiddlewareBoolean
): WebHandler {
  return async (request: Request): Promise<Response | undefined> => {
    const req = createIncomingMessage(request);
    const { res, onReadable } = createServerResponse(req);

    return new Promise<Response | undefined>((resolve, reject) => {
      onReadable(({ readable, headers, statusCode }) => {
        const responseBody = statusCodesWithoutBody.includes(statusCode)
          ? null
          : (Readable.toWeb(readable) as unknown as ReadableStream);
        resolve(
          new Response(responseBody, {
            status: statusCode,
            headers: flattenHeaders(headers),
          })
        );
      });

      const next = (error?: unknown) => {
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } else {
          resolve(undefined);
        }
      };

      Promise.resolve(handler(req, res, next))
        .then((handled) => {
          if (handled === false) {
            res.destroy();
            resolve(undefined);
          }
        })
        .catch(next);
    });
  };
}

/**
 * Creates an IncomingMessage object from a web Request.
 *
 * @param {Request} request - The web Request object.
 * @returns {IncomingMessage} An IncomingMessage-like object compatible with Node.js HTTP module.
 */
function createIncomingMessage(request: Request): IncomingMessage {
  const parsedUrl = new URL(request.url, "http://localhost");
  const pathnameAndQuery =
    (parsedUrl.pathname || "") + (parsedUrl.search || "");
  const body = request.body
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Readable.fromWeb(request.body as any)
    : Readable.from([]);

  return Object.assign(body, {
    url: pathnameAndQuery,
    method: request.method,
    headers: Object.fromEntries(request.headers),
  }) as IncomingMessage;
}

let runtime:
  | {
      type: "dev";
      server: vite.ViteDevServer;
      middleware: WebHandler;
    }
  | { type: "prod"; static: ServeOptions["static"] };

if (process.env.NODE_ENV !== "production") {
  const server = await vite.createServer({
    logLevel: "info",
    server: { middlewareMode: true },
    appType: "custom",
  });
  runtime = {
    type: "dev",
    server,
    middleware: connectToWeb(server.middlewares),
  };
} else {
  const build: ServeOptions["static"] = {};

  for (const filepath of new Bun.Glob("**/*").scanSync("./dist")) {
    const file = Bun.file(path.join("./dist", filepath));

    let pathname = `/${filepath}` as const;
    if (filepath === "index.html") {
      pathname = "/" as const;
    }
    build[pathname] = new Response(await file.bytes(), {
      headers: {
        "Content-Type": file.type,
      },
    });
  }

  runtime = {
    type: "prod",
    static: build,
  };
}

const resolveBackendEntrypoint = () => {
  if (runtime.type === "dev") {
    if (!vite.isRunnableDevEnvironment(runtime.server.environments.ssr)) {
      throw new Error("SSR dev environment not found");
    }
    return runtime.server.environments.ssr.runner.import("/backend.ts");
  }

  return import("./backend");
};

let port = 3000;
if (process.env.PORT !== undefined) {
  port = parseInt(process.env.PORT);
}

console.log(`Listening on http://localhost:${port}`);

const entrypoint = await Bun.file("./index.html").text();

Bun.serve({
  port,
  idleTimeout: 255,
  reusePort: true,
  ...(runtime.type === "prod" ? { static: runtime.static } : {}),
  development: runtime.type === "dev",
  fetch: async (req) => {
    try {
      const url = new URL(req.url);

      if (runtime.type === "dev") {
        const response = await runtime.middleware(req.clone());
        if (response !== undefined) {
          return response;
        }

        const entry = await resolveBackendEntrypoint();

        const middleware = await entry.default({ req, url });
        if (middleware !== undefined) {
          return middleware;
        }

        const template = await runtime.server.transformIndexHtml(
          url.pathname,
          entrypoint
        );

        return new Response(template, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      } else {
        const entry = await resolveBackendEntrypoint();

        const middleware = await entry.default({
          req,
          url,
        });
        if (middleware !== undefined) {
          return middleware;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (runtime.type === "dev") {
          runtime.server.ssrFixStacktrace(err);
        }
        console.info(err);
        return new Response(err.stack, { status: 500 });
      }
    }
  },
});
