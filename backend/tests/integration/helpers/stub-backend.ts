import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";

type StubRequest = {
  method: StubHttpMethod;
  path: string;
  pathname: string;
  query: Record<string, string>;
  headers: IncomingMessage["headers"];
  bodyText: string;
  bodyJson: unknown;
};

type StubResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Record<string, unknown> | unknown[];
  delayMs?: number;
  disconnect?: boolean;
};

type StubHandler = (request: StubRequest) => StubResponse | Promise<StubResponse>;

type ApiKeyProtection = {
  in?: "header" | "query";
  name: string;
  value: string;
};

const stubHttpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type StubHttpMethod = (typeof stubHttpMethods)[number];

const parseStubHttpMethod = (value: string | undefined): StubHttpMethod | null => {
  const normalized = (value ?? "GET").toUpperCase();

  return stubHttpMethods.find((method) => method === normalized) ?? null;
};

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
  const handlers = new Map<StubHttpMethod, Map<string, StubHandler>>();
  const requests: StubRequest[] = [];

  const getRouteHandlers = (method: StubHttpMethod) => {
    let routeHandlers = handlers.get(method);
    if (!routeHandlers) {
      routeHandlers = new Map<string, StubHandler>();
      handlers.set(method, routeHandlers);
    }

    return routeHandlers;
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    await once(req, "end");

    const path = req.url ?? "/";
    const parsedUrl = new URL(path, "http://127.0.0.1");
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const method = parseStubHttpMethod(req.method);
    if (!method) {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    const recordedRequest: StubRequest = {
      method,
      path,
      pathname: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      headers: req.headers,
      bodyText,
      bodyJson: parseBodyJson(bodyText)
    };
    requests.push(recordedRequest);

    const routeHandlers = handlers.get(recordedRequest.method);
    const handler = routeHandlers?.get(recordedRequest.pathname) ?? routeHandlers?.get(path);
    if (!handler) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const response = await handler(recordedRequest);

    if (response.delayMs && response.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    }

    if (response.disconnect) {
      req.socket.destroy();
      return;
    }

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
      const normalizedMethod = parseStubHttpMethod(method);
      if (!normalizedMethod) {
        throw new Error(`Unsupported stub backend method: ${method}`);
      }

      getRouteHandlers(normalizedMethod).set(path, handler);
    },
    onApiKeyProtected(
      method: string,
      path: string,
      protection: ApiKeyProtection,
      handler: StubHandler
    ) {
      const normalizedMethod = parseStubHttpMethod(method);
      if (!normalizedMethod) {
        throw new Error(`Unsupported stub backend method: ${method}`);
      }

      getRouteHandlers(normalizedMethod).set(path, async (request) => {
        const placement = protection.in ?? "header";
        const actualValue =
          placement === "query"
            ? request.query[protection.name]
            : request.headers[protection.name.toLowerCase()];
        const normalizedActual = Array.isArray(actualValue) ? actualValue[0] : actualValue;

        if (normalizedActual !== protection.value) {
          return {
            status: 401,
            body: {
              error: "invalid_api_key"
            }
          };
        }

        return handler(request);
      });
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
