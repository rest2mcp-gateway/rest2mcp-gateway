import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

type StubRequest = {
  method: string;
  path: string;
  headers: IncomingMessage["headers"];
  bodyText: string;
  bodyJson: unknown;
};

type StubResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown> | unknown[];
};

type StubHandler = (request: StubRequest) => StubResponse | Promise<StubResponse>;

const routeKey = (method: string, path: string) => `${method.toUpperCase()} ${path}`;

const parseBodyJson = (bodyText: string) => {
  if (!bodyText) {
    return undefined;
  }

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
};

export const createStubBackend = async () => {
  const handlers = new Map<string, StubHandler>();
  const requests: StubRequest[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    await once(req, "end");

    const path = req.url ?? "/";
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const recordedRequest: StubRequest = {
      method: (req.method ?? "GET").toUpperCase(),
      path,
      headers: req.headers,
      bodyText,
      bodyJson: parseBodyJson(bodyText)
    };
    requests.push(recordedRequest);

    const handler = handlers.get(routeKey(recordedRequest.method, path));
    if (!handler) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const response = await handler(recordedRequest);
    const status = response.status ?? 200;
    const body = response.body ?? {};
    const isJsonBody = typeof body !== "string";

    res.statusCode = status;
    res.setHeader("content-type", isJsonBody ? "application/json" : "text/plain");

    for (const [name, value] of Object.entries(response.headers ?? {})) {
      res.setHeader(name, value);
    }

    res.end(isJsonBody ? JSON.stringify(body) : body);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine stub backend address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    on(method: string, path: string, handler: StubHandler) {
      handlers.set(routeKey(method, path), handler);
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
};

export type { StubRequest, StubResponse };
