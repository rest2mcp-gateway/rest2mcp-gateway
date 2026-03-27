import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { AppError } from "../../lib/errors.js";

type AuthServerConfig = {
  issuer: string;
  jwksUri: string;
  authorizationServerMetadataUrl?: string | null;
};

type RuntimeServerAuthConfig = {
  accessMode: string;
  audience: string | null;
};

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

const getJwks = (jwksUri: string) => {
  const existing = jwksCache.get(jwksUri);
  if (existing) {
    return existing;
  }

  const next = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(jwksUri, next);
  return next;
};

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

export const getProtectedResourceMetadataUrl = (request: FastifyRequest, organizationSlug: string, serverSlug: string) =>
  getOAuthProtectedResourceMetadataUrl(new URL(`/mcp/${organizationSlug}/${serverSlug}`, `${request.protocol}://${request.headers.host}`));

export const buildProtectedResourceMetadata = (
  request: FastifyRequest,
  organizationSlug: string,
  serverSlug: string,
  authServerConfig: AuthServerConfig,
  resourceName: string
) => ({
  resource: new URL(`/mcp/${organizationSlug}/${serverSlug}`, `${request.protocol}://${request.headers.host}`).href,
  authorization_servers: [authServerConfig.issuer],
  resource_name: resourceName
});

export const buildUnauthorizedChallenge = (
  request: FastifyRequest,
  organizationSlug: string,
  serverSlug: string
) => `Bearer resource_metadata="${getProtectedResourceMetadataUrl(request, organizationSlug, serverSlug)}"`;

export const validateRuntimeAccessToken = async (
  request: FastifyRequest,
  organizationSlug: string,
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
      wwwAuthenticate: buildUnauthorizedChallenge(request, organizationSlug, serverSlug)
    });
  }

  try {
    const result = await jwtVerify(token, getJwks(authServerConfig.jwksUri), {
      issuer: authServerConfig.issuer,
      audience: runtimeServer.audience ?? undefined
    });
    return result.payload;
  } catch (error) {
    throw new AppError(401, error instanceof Error ? error.message : "Invalid access token", "runtime_auth_invalid_token", {
      wwwAuthenticate: buildUnauthorizedChallenge(request, organizationSlug, serverSlug)
    });
  }
};
