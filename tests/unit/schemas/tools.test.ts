import assert from "node:assert/strict";
import test from "node:test";
import { toolBodySchema } from "../../../src/modules/tools/schemas.js";

test("toolBodySchema applies defaults and accepts nullable mapping", () => {
  const result = toolBodySchema.parse({
    mcpServerId: "11111111-1111-1111-1111-111111111111",
    name: "create_widget",
    slug: "create-widget",
    title: "Create widget",
    mapping: null
  });

  assert.deepEqual(result, {
    mcpServerId: "11111111-1111-1111-1111-111111111111",
    name: "create_widget",
    slug: "create-widget",
    title: "Create widget",
    inputSchema: {},
    outputSchema: {},
    examples: [],
    riskLevel: "low",
    isActive: true,
    scopeIds: [],
    mapping: null
  });
});
