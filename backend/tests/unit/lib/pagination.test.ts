import assert from "node:assert/strict";
import test from "node:test";
import { paginationSchema, toOffset } from "../../../src/lib/pagination.js";

test("paginationSchema applies defaults and coercion", () => {
  const parsed = paginationSchema.parse({
    page: "2",
    pageSize: "10",
    isActive: "true"
  });

  assert.deepEqual(parsed, {
    page: 2,
    pageSize: 10,
    isActive: true
  });
});

test("toOffset converts page and pageSize to a row offset", () => {
  assert.equal(toOffset(1, 20), 0);
  assert.equal(toOffset(3, 20), 40);
});
