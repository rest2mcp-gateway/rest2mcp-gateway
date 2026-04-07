import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

type TokenOptions = {
  issuer?: string;
  audience?: string;
  subject?: string;
  scope?: string;
  expiresIn?: string;
  extraClaims?: Record<string, unknown>;
};

export const createStubAuthServer = async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const issuer = "http://127.0.0.1";

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
