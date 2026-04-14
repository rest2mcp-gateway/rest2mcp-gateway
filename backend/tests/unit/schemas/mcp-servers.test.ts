import assert from "node:assert/strict";
import test from "node:test";
import { mcpServerBodySchema } from "../../../src/modules/mcp-servers/schemas.js";

const baseInput = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  name: "Public server",
  slug: "public-server"
};

test("mcpServerBodySchema requires audience for protected servers", () => {
  const result = mcpServerBodySchema.safeParse({
    ...baseInput,
    accessMode: "protected"
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues.map((issue) => issue.path.join(".")), ["audience"]);
});

test("mcpServerBodySchema accepts protected servers with an audience", () => {
  const result = mcpServerBodySchema.safeParse({
    ...baseInput,
    accessMode: "protected",
    audience: "urn:widgets"
  });

  assert.equal(result.success, true);
});
