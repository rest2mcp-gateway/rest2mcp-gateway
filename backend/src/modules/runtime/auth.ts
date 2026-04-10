import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { AppError } from "../../lib/errors.js";
import { decryptSecret } from "../../lib/crypto.js";

type AuthServerConfig = {
  issuer: string;
  jwksUri: string;
  tokenEndpoint?: string | null;
  clientId?: string | null;
  encryptedClientSecret?: string | null;
};

type RuntimeServerAuthConfig = {
  accessMode: string;
  audience: string | null;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export type ValidatedRuntimeAccessToken = {
  accessToken: string;
  payload: Record<string, unknown>;
  scopes: string[];
};

export const getJwks = (jwksUri: string) => {
  const existing = jwksCache.get(jwksUri);
  if (existing) {
    return existing;
  }

  const next = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(jwksUri, next);
  return next;
};

export const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
};

export const getProtectedResourceMetadataUrl = (request: FastifyRequest, serverSlug: string) =>
  getOAuthProtectedResourceMetadataUrl(new URL(`/mcp/${serverSlug}`, `${request.protocol}://${request.headers.host}`));

export const buildProtectedResourceMetadata = (
  request: FastifyRequest,
  serverSlug: string,
  authServerConfig: AuthServerConfig,
  resourceName: string,
  scopesSupported: string[] = []
) => ({
  resource: new URL(`/mcp/${serverSlug}`, `${request.protocol}://${request.headers.host}`).href,
  authorization_servers: [authServerConfig.issuer],
  resource_name: resourceName,
  scopes_supported: scopesSupported
});

export const buildUnauthorizedChallenge = (
  request: FastifyRequest,
  serverSlug: string
) => `Bearer resource_metadata="${getProtectedResourceMetadataUrl(request, serverSlug)}"`;

export const parseTokenScopes = (value: unknown) => {
  if (typeof value === "string") {
    return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }

  return [];
};

export const ensureTokenHasScopes = (
  tokenPayload: unknown,
  requiredScopes: string[],
  request: FastifyRequest,
  serverSlug: string
) => {
  const normalizedRequiredScopes = Array.from(new Set(requiredScopes.filter((scope) => scope.trim().length > 0)));
  if (normalizedRequiredScopes.length === 0) {
    return;
  }

  const payload =
    tokenPayload && typeof tokenPayload === "object" && !Array.isArray(tokenPayload)
      ? tokenPayload as Record<string, unknown>
      : {};
  const grantedScopes = new Set([
    ...parseTokenScopes(payload.scope),
    ...parseTokenScopes(payload.scp)
  ]);

  const missingScopes = normalizedRequiredScopes.filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length === 0) {
    return;
  }

  throw new AppError(403, `Missing required scopes: ${missingScopes.join(", ")}`, "runtime_auth_insufficient_scope", {
    wwwAuthenticate: `${buildUnauthorizedChallenge(request, serverSlug)}, error="insufficient_scope", scope="${normalizedRequiredScopes.join(" ")}"`
  });
};

export const validateRuntimeAccessToken = async (
  request: FastifyRequest,
  serverSlug: string,
  authServerConfig: AuthServerConfig | null,
  runtimeServer: RuntimeServerAuthConfig
) => {
  if (runtimeServer.accessMode !== "protected") {
    return null;
  }

  if (!authServerConfig) {
    throw new AppError(503, "Authorization server configuration is missing", "runtime_auth_not_configured");
  }

  const token = getBearerToken(request.headers.authorization);
  if (!token) {
    throw new AppError(401, "Missing bearer token", "runtime_auth_missing_token", {
      wwwAuthenticate: buildUnauthorizedChallenge(request, serverSlug)
    });
  }

  try {
    const verifyOptions =
      runtimeServer.audience
        ? { issuer: authServerConfig.issuer, audience: runtimeServer.audience }
        : { issuer: authServerConfig.issuer };
    const result = await jwtVerify(token, getJwks(authServerConfig.jwksUri), verifyOptions);
    return {
      accessToken: token,
      payload: result.payload as Record<string, unknown>,
      scopes: Array.from(
        new Set([
          ...parseTokenScopes(result.payload.scope),
          ...parseTokenScopes(result.payload.scp)
        ])
      )
    } satisfies ValidatedRuntimeAccessToken;
  } catch (error) {
    throw new AppError(401, error instanceof Error ? error.message : "Invalid access token", "runtime_auth_invalid_token", {
      wwwAuthenticate: buildUnauthorizedChallenge(request, serverSlug)
    });
  }
};

export const exchangeRuntimeAccessToken = async (
  authServerConfig: AuthServerConfig | null,
  audience: string,
  runtimeAuth: ValidatedRuntimeAccessToken | null
) => {
  if (!runtimeAuth) {
    throw new AppError(
      401,
      "Backend token exchange requires an authenticated caller token",
      "runtime_token_exchange_missing_subject_token"
    );
  }

  if (!authServerConfig) {
    throw new AppError(
      503,
      "Authorization server configuration is missing",
      "runtime_token_exchange_not_configured"
    );
  }

  if (!authServerConfig.tokenEndpoint || !authServerConfig.clientId || !authServerConfig.encryptedClientSecret) {
    throw new AppError(
      503,
      "Token exchange is not fully configured",
      "runtime_token_exchange_not_configured"
    );
  }

  const clientSecret = decryptSecret(authServerConfig.encryptedClientSecret);
  const payload = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: runtimeAuth.accessToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
    audience
  });

  if (runtimeAuth.scopes.length > 0) {
    payload.set("scope", runtimeAuth.scopes.join(" "));
  }

  const response = await fetch(authServerConfig.tokenEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${authServerConfig.clientId}:${clientSecret}`).toString("base64")}`
    },
    body: payload.toString()
  });

  const contentType = response.headers.get("content-type") ?? "";
  const responseBody = contentType.includes("application/json")
    ? await response.json() as Record<string, unknown>
    : await response.text();

  if (!response.ok) {
    throw new AppError(
      502,
      "Token exchange failed",
      "runtime_token_exchange_failed",
      {
        status: response.status,
        body: responseBody
      }
    );
  }

  const accessToken =
    responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
      ? responseBody.access_token
      : null;
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new AppError(
      502,
      "Token exchange response did not include an access token",
      "runtime_token_exchange_invalid_response"
    );
  }

  return accessToken;
};
