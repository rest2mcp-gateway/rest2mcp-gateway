import test from "node:test";
import assert from "node:assert/strict";

test("validation result shape is deterministic", async () => {
  const serializer = await import("../src/modules/config/serializer.js");
  assert.deepEqual(serializer.serializeValidationResult([]), {
    valid: true,
    issues: []
  });
  assert.deepEqual(serializer.serializeValidationResult(["missing tool mapping"]), {
    valid: false,
    issues: ["missing tool mapping"]
  });
});
