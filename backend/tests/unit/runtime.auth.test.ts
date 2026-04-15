import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { AppError } from "../../src/lib/errors.js";
import {
  assertAllowedRuntimeOrigin,
  buildProtectedResourceMetadata,
  buildUnauthorizedChallenge,
  ensureTokenHasScopes,
  getBearerToken,
  getProtectedResourceMetadataUrl,
  isAllowedOrigin,
  normalizeOrigin,
  parseTokenScopes,
  validateRuntimeAccessToken
} from "../../src/modules/runtime/auth.js";

const createRequest = (authorization?: string, origin?: string): FastifyRequest => ({
  protocol: "https",
  headers: {
    host: "gateway.example.com",
    authorization,
    origin
  }
} as FastifyRequest);

test("getBearerToken extracts bearer tokens and ignores other headers", () => {
  assert.equal(getBearerToken("Bearer token-123"), "token-123");
  assert.equal(getBearerToken("bearer token-456"), "token-456");
  assert.equal(getBearerToken("Bearer"), null);
  assert.equal(getBearerToken("Bearer    "), null);
  assert.equal(getBearerToken("Basic abc"), null);
  assert.equal(getBearerToken(undefined), null);
});

test("normalizeOrigin canonicalizes origins", () => {
  assert.equal(normalizeOrigin("https://app.example.com/path?q=1"), "https://app.example.com");
  assert.equal(normalizeOrigin("https://app.example.com:8443"), "https://app.example.com:8443");
});

test("isAllowedOrigin matches normalized entries", () => {
  assert.equal(
    isAllowedOrigin("https://app.example.com", ["https://app.example.com", "https://other.example.com"]),
    true
  );
  assert.equal(isAllowedOrigin("https://app.example.com", ["https://other.example.com"]), false);
});

test("assertAllowedRuntimeOrigin allows missing origins for non-browser clients", () => {
  assert.equal(assertAllowedRuntimeOrigin(undefined, ["https://app.example.com"]), null);
});

test("assertAllowedRuntimeOrigin rejects malformed and untrusted origins", () => {
  assert.throws(() => assertAllowedRuntimeOrigin("not-a-url", ["https://app.example.com"]), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, "runtime_origin_forbidden");
    return true;
  });

  assert.throws(
    () => assertAllowedRuntimeOrigin("https://evil.example.com", ["https://app.example.com"]),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "runtime_origin_forbidden");
      return true;
    }
  );
});

test("assertAllowedRuntimeOrigin returns the normalized trusted origin", () => {
  assert.equal(
    assertAllowedRuntimeOrigin("https://app.example.com/path", ["https://app.example.com"]),
    "https://app.example.com"
  );
});

test("buildProtectedResourceMetadata returns resource metadata with scopes", () => {
  const request = createRequest();
  const metadata = buildProtectedResourceMetadata(
    request,
    "public-server",
    {
      issuer: "https://issuer.example.com",
      jwksUri: "https://issuer.example.com/jwks.json"
    },
    "Acme MCP",
    ["widgets:read", "widgets:write"]
  );

  assert.deepEqual(metadata, {
    resource: "https://gateway.example.com/mcp/public-server",
    authorization_servers: ["https://issuer.example.com"],
    resource_name: "Acme MCP",
    scopes_supported: ["widgets:read", "widgets:write"]
  });
});

test("buildUnauthorizedChallenge points to protected resource metadata", () => {
  const request = createRequest();

  assert.equal(
    buildUnauthorizedChallenge(request, "public-server"),
    `Bearer resource_metadata="${getProtectedResourceMetadataUrl(request, "public-server")}"`
  );
});

test("parseTokenScopes supports string and array claims", () => {
  assert.deepEqual(parseTokenScopes("widgets:read widgets:write"), ["widgets:read", "widgets:write"]);
  assert.deepEqual(parseTokenScopes(["widgets:read", "", "widgets:write", 7]), ["widgets:read", "widgets:write"]);
  assert.deepEqual(parseTokenScopes(undefined), []);
});

test("ensureTokenHasScopes accepts combined scope and scp claims", () => {
  assert.doesNotThrow(() =>
    ensureTokenHasScopes(
        { scope: "widgets:read", scp: ["widgets:write"] },
        ["widgets:read", "widgets:write", "widgets:write"],
        createRequest(),
        "public-server"
      )
  );
});

test("ensureTokenHasScopes is a no-op when no scopes are required", () => {
  assert.doesNotThrow(() =>
    ensureTokenHasScopes(
        { scope: "widgets:read" },
        ["", "   "],
        createRequest(),
        "public-server"
      )
  );
});

test("ensureTokenHasScopes throws insufficient_scope with a challenge", () => {
  assert.throws(
    () =>
      ensureTokenHasScopes(
        { scope: "widgets:read" },
        ["widgets:write", "widgets:write"],
        createRequest(),
        "public-server"
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, "runtime_auth_insufficient_scope");
      const details = error.details as { wwwAuthenticate?: string };
      assert.match(details.wwwAuthenticate ?? "", /insufficient_scope/);
      assert.match(details.wwwAuthenticate ?? "", /scope="widgets:write"/);
      return true;
    }
  );
});

test("validateRuntimeAccessToken returns null for public runtimes", async () => {
  const result = await validateRuntimeAccessToken(
    createRequest(),
    "public-server",
    null,
    { accessMode: "public", audience: null }
  );

  assert.equal(result, null);
});

test("validateRuntimeAccessToken rejects protected runtimes without auth configuration", async () => {
  await assert.rejects(
    validateRuntimeAccessToken(
      createRequest("Bearer token"),
      "protected-server",
      null,
      { accessMode: "protected", audience: "urn:test" }
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, "runtime_auth_not_configured");
      return true;
    }
  );
});

test("validateRuntimeAccessToken rejects missing bearer tokens", async () => {
  await assert.rejects(
    validateRuntimeAccessToken(
      createRequest(),
      "protected-server",
      {
        issuer: "https://issuer.example.com",
        jwksUri: "https://issuer.example.com/jwks.json"
      },
      { accessMode: "protected", audience: "urn:test" }
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "runtime_auth_missing_token");
      const details = error.details as { wwwAuthenticate?: string };
      assert.match(details.wwwAuthenticate ?? "", /resource_metadata=/);
      return true;
    }
  );
});

test("validateRuntimeAccessToken maps invalid tokens to AppError", async () => {
  await assert.rejects(
    validateRuntimeAccessToken(
      createRequest("Bearer definitely-not-a-jwt"),
      "protected-server",
      {
        issuer: "https://issuer.example.com",
        jwksUri: "https://issuer.example.com/jwks.json"
      },
      { accessMode: "protected", audience: "urn:test" }
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "runtime_auth_invalid_token");
      const details = error.details as { wwwAuthenticate?: string };
      assert.match(details.wwwAuthenticate ?? "", /resource_metadata=/);
      return true;
    }
  );
});
