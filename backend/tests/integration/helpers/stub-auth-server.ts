import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Buffer } from "node:buffer";

type TokenOptions = {
  issuer?: string;
  audience?: string;
  subject?: string;
  scope?: string;
  expiresIn?: string;
  extraClaims?: Record<string, unknown>;
};

type TokenExchangeRequest = {
  authorization: string | undefined;
  params: Record<string, string>;
};

type TokenExchangeResponse = {
  status?: number;
  body?: Record<string, unknown>;
};

export const createStubAuthServer = async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const issuer = "http://127.0.0.1";
  const tokenExchangeRequests: TokenExchangeRequest[] = [];
  let tokenExchangeHandler: ((request: TokenExchangeRequest) => TokenExchangeResponse | Promise<TokenExchangeResponse>) | null = null;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", issuer);

    if (url.pathname === "/.well-known/jwks.json") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        keys: [{ ...publicJwk, use: "sig", alg: "RS256", kid: "test-key-1" }]
      }));
      return;
    }

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        issuer,
        jwks_uri: `${issuer}/.well-known/jwks.json`
      }));
      return;
    }

    if (url.pathname === "/token" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      await new Promise<void>((resolve) => req.on("end", () => resolve()));
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const params = Object.fromEntries(new URLSearchParams(bodyText).entries());
      const requestPayload = {
        authorization: typeof req.headers.authorization === "string" ? req.headers.authorization : undefined,
        params
      };
      tokenExchangeRequests.push(requestPayload);

      const custom = tokenExchangeHandler ? await tokenExchangeHandler(requestPayload) : null;
      const responseBody = custom?.body ?? {
        access_token: "stub-exchanged-access-token",
        token_type: "Bearer",
        expires_in: 300,
        scope: params.scope ?? ""
      };
      res.statusCode = custom?.status ?? 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(responseBody));
      return;
    }

    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine stub auth server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    issuer: baseUrl,
    jwksUri: `${baseUrl}/.well-known/jwks.json`,
    tokenEndpoint: `${baseUrl}/token`,
    tokenExchangeRequests,
    onTokenExchange(handler: (request: TokenExchangeRequest) => TokenExchangeResponse | Promise<TokenExchangeResponse>) {
      tokenExchangeHandler = handler;
    },
    async issueToken(options: TokenOptions = {}) {
      const now = Math.floor(Date.now() / 1000);
      const jwt = new SignJWT({
        ...(options.scope ? { scope: options.scope } : {}),
        ...(options.extraClaims ?? {})
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
        .setIssuedAt(now)
        .setIssuer(options.issuer ?? baseUrl)
        .setAudience(options.audience ?? "runtime-test-audience")
        .setSubject(options.subject ?? "test-user")
        .setExpirationTime(options.expiresIn ?? "5m");

      return jwt.sign(privateKey);
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
