import assert from "node:assert/strict";
import test from "node:test";
import { secretBodySchema, secretUpdateSchema } from "../../../src/modules/secrets/schemas.js";

const baseInput = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  name: "Secret"
};

test("secretBodySchema requires plaintextValue for database-backed secrets", () => {
  const result = secretBodySchema.safeParse({
    ...baseInput,
    storageMode: "database"
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0]?.message ?? "", /plaintextValue is required/);
});

test("secretBodySchema requires externalRef for external_ref secrets", () => {
  const result = secretBodySchema.safeParse({
    ...baseInput,
    storageMode: "external_ref"
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0]?.message ?? "", /externalRef is required/);
});

test("secretUpdateSchema preserves the same validation rules", () => {
  const result = secretUpdateSchema.safeParse({
    storageMode: "database"
  });

  assert.equal(result.success, false);
  assert.match(result.error.issues[0]?.message ?? "", /plaintextValue is required/);
});
