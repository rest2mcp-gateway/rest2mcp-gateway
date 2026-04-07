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

test("paginationSchema parses false boolean query parameters correctly", () => {
  const parsed = paginationSchema.parse({
    isActive: "false"
  });

  assert.deepEqual(parsed, {
    page: 1,
    pageSize: 20,
    isActive: false
  });
});

test("toOffset converts page and pageSize to a row offset", () => {
  assert.equal(toOffset(1, 20), 0);
  assert.equal(toOffset(3, 20), 40);
});
