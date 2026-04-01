import test from "node:test";
import assert from "node:assert/strict";
import { createTestApp } from "./helpers/runtime-app.js";
import {
  adminRequest,
  createRuntimeFixture,
  loginAsBootstrapAdmin
} from "./helpers/workflows.js";

test("prevents deleting a backend API while tools still reference it", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://example.test");

    const result = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/backend-apis/${fixture.backendApiId}`
    });

    assert.equal(result.response.statusCode, 409, result.response.body);
    assert.equal(result.body.error.code, "backend_api_in_use");
    assert.match(result.body.error.message, /Cannot delete backend API/i);
    assert.equal(result.body.error.details.references.length, 1);
    assert.equal(result.body.error.details.references[0].toolName, "echo_widget");
  } finally {
    await handle.close();
  }
});

test("prevents deleting a backend resource while tools still reference it", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://example.test");

    const result = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/backend-resources/${fixture.backendResourceId}`
    });

    assert.equal(result.response.statusCode, 409, result.response.body);
    assert.equal(result.body.error.code, "backend_resource_in_use");
    assert.match(result.body.error.message, /Cannot delete backend resource/i);
    assert.equal(result.body.error.details.references.length, 1);
    assert.equal(result.body.error.details.references[0].toolName, "echo_widget");
  } finally {
    await handle.close();
  }
});

test("prevents deleting a scope while a tool still uses it", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://example.test", { authType: "none" }, {
      accessMode: "public",
      scopeNames: ["widgets.execute"]
    });

    const result = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/scopes/${fixture.scopeIds[0]}`
    });

    assert.equal(result.response.statusCode, 409, result.response.body);
    assert.equal(result.body.error.code, "scope_in_use");
    assert.match(result.body.error.message, /Cannot delete scope/i);
    assert.equal(result.body.error.details.references.length, 1);
    assert.equal(result.body.error.details.references[0].toolName, "echo_widget");
  } finally {
    await handle.close();
  }
});

test("allows deleting API resources and scopes after the dependent tool is removed", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://example.test", { authType: "none" }, {
      accessMode: "public",
      scopeNames: ["widgets.execute"]
    });

    const deleteTool = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/tools/${fixture.toolId}`
    });
    assert.equal(deleteTool.response.statusCode, 200, deleteTool.response.body);

    const deleteScope = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/scopes/${fixture.scopeIds[0]}`
    });
    assert.equal(deleteScope.response.statusCode, 200, deleteScope.response.body);

    const deleteResource = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/backend-resources/${fixture.backendResourceId}`
    });
    assert.equal(deleteResource.response.statusCode, 200, deleteResource.response.body);

    const deleteApi = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/backend-apis/${fixture.backendApiId}`
    });
    assert.equal(deleteApi.response.statusCode, 200, deleteApi.response.body);
  } finally {
    await handle.close();
  }
});
