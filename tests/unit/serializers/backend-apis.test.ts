import assert from "node:assert/strict";
import test from "node:test";
import { serializeBackendApi } from "../../../src/modules/backend-apis/serializer.js";

test("serializeBackendApi masks api_key secrets and exposes helper fields", () => {
  const serialized = serializeBackendApi({
    authType: "api_key",
    authConfig: {
      in: "query",
      name: "api_key",
      encryptedValue: "ciphertext"
    }
  });

  assert.deepEqual(serialized.authConfig, {
    in: "query",
    name: "api_key",
    hasValue: true,
    maskedValue: "••••"
  });
  assert.equal(serialized.apiKeyLocation, "query");
  assert.equal(serialized.apiKeyName, "api_key");
  assert.equal(serialized.hasApiKeyValue, true);
  assert.equal(serialized.apiKeyMaskedValue, "••••");
});

test("serializeBackendApi exposes basic auth username and password presence only", () => {
  const serialized = serializeBackendApi({
    authType: "basic",
    authConfig: {
      username: "alice",
      encryptedPassword: "ciphertext"
    }
  });

  assert.deepEqual(serialized.authConfig, {
    username: "alice",
    hasPassword: true
  });
  assert.equal(serialized.basicUsername, "alice");
  assert.equal(serialized.hasBasicPassword, true);
});

test("serializeBackendApi exposes bearer and oauth2 token presence without plaintext", () => {
  const bearer = serializeBackendApi({
    authType: "bearer",
    authConfig: {
      encryptedToken: "ciphertext"
    }
  });
  const oauth = serializeBackendApi({
    authType: "oauth2",
    authConfig: {
      accessToken: "legacy-token"
    }
  });

  assert.deepEqual(bearer.authConfig, { hasToken: true });
  assert.equal(bearer.hasBearerToken, true);
  assert.equal(bearer.bearerToken, null);
  assert.deepEqual(oauth.authConfig, { hasAccessToken: true });
  assert.equal(oauth.hasOauth2AccessToken, true);
  assert.equal(oauth.oauth2AccessToken, null);
});
