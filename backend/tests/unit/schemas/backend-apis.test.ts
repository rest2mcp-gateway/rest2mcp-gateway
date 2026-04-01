import assert from "node:assert/strict";
import test from "node:test";
import { backendApiBodySchema } from "../../../src/modules/backend-apis/schemas.js";

const baseInput = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  name: "Backend API",
  slug: "backend-api",
  defaultBaseUrl: "https://backend.example.com"
};

test("backendApiBodySchema requires API key auth fields", () => {
  const result = backendApiBodySchema.safeParse({
    ...baseInput,
    authType: "api_key"
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues.map((issue) => issue.path.join(".")), [
    "apiKeyLocation",
    "apiKeyName",
    "apiKeyValue"
  ]);
});

test("backendApiBodySchema requires bearer token", () => {
  const result = backendApiBodySchema.safeParse({
    ...baseInput,
    authType: "bearer"
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues.map((issue) => issue.path.join(".")), ["bearerToken"]);
});

test("backendApiBodySchema requires oauth2 access token", () => {
  const result = backendApiBodySchema.safeParse({
    ...baseInput,
    authType: "oauth2"
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues.map((issue) => issue.path.join(".")), ["oauth2AccessToken"]);
});

test("backendApiBodySchema requires basic auth username and password", () => {
  const result = backendApiBodySchema.safeParse({
    ...baseInput,
    authType: "basic"
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues.map((issue) => issue.path.join(".")), [
    "basicUsername",
    "basicPassword"
  ]);
});

test("backendApiBodySchema accepts a complete API key config", () => {
  const result = backendApiBodySchema.safeParse({
    ...baseInput,
    authType: "api_key",
    apiKeyLocation: "header",
    apiKeyName: "x-api-key",
    apiKeyValue: "secret"
  });

  assert.equal(result.success, true);
});
