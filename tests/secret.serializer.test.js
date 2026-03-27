import test from "node:test";
import assert from "node:assert/strict";
import { serializeSecret } from "../src/modules/secrets/serializer.js";
test("secret serializer never exposes plaintext or encrypted value", () => {
    const serialized = serializeSecret({
        id: "sec_1",
        encryptedValue: "ciphertext",
        plaintextValue: "plain"
    });
    assert.equal(serialized.encryptedValue, undefined);
    assert.equal(serialized.plaintextValue, undefined);
    assert.equal(serialized.hasValue, true);
});
