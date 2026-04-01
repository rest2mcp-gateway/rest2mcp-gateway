import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../../../src/lib/crypto.js";

test("encryptSecret and decryptSecret round-trip values", () => {
  const plaintext = "super-secret-value";
  const encrypted = encryptSecret(plaintext);

  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptSecret(encrypted), plaintext);
});

test("decryptSecret rejects malformed payloads", () => {
  assert.throws(() => decryptSecret("not-valid-base64"));
});
