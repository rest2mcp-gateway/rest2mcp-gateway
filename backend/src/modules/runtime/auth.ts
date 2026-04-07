import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { AppError } from "../../lib/errors.js";

type AuthServerConfig = {
  issuer: string;
  jwksUri: string;
};

type RuntimeServerAuthConfig = {
  accessMode: string;
  audience: string | null;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

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
    return result.payload;
  } catch (error) {
    throw new AppError(401, error instanceof Error ? error.message : "Invalid access token", "runtime_auth_invalid_token", {
      wwwAuthenticate: buildUnauthorizedChallenge(request, serverSlug)
    });
  }
};
