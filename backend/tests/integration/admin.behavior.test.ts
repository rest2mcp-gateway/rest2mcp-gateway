import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { backendApis, secrets, toolMappings, toolScopes, users } from "../../src/db/schema.js";
import { createTestApp } from "./helpers/runtime-app.js";
import {
  adminRequest,
  createOrganization,
  createRuntimeFixture,
  createUser,
  getTool,
  loginAsBootstrapAdmin,
  request,
  updateUser,
  validateAndPublish
} from "./helpers/workflows.js";

test("tool create rejects invalid scope IDs", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://widgets.example.test");

    const result = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tools",
      payload: {
        mcpServerId: fixture.mcpServerId,
        name: "invalid_scope_tool",
        slug: "invalid-scope-tool",
        title: "Invalid scope tool",
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: true,
        scopeIds: ["11111111-1111-1111-1111-111111111111"],
        mapping: {
          backendResourceId: fixture.backendResourceId
        }
      }
    });

    assert.equal(result.response.statusCode, 400, result.response.body);
    assert.equal(result.body.error.code, "invalid_scope_ids");
  } finally {
    await handle.close();
  }
});

test("tool create rejects backend resources from another organization", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://widgets.example.test");
    const otherOrganization = await createOrganization(handle.app, session, {
      name: "Other Org",
      slug: "other-org"
    });
    await createUser(handle.app, session, {
      organizationId: otherOrganization.id,
      username: "other-admin",
      name: "Other Admin",
      role: "admin",
      authMode: "local",
      password: "other-admin-password",
      isActive: true
    });

    const otherLogin = await request(handle.app, {
      method: "POST",
      url: "/api/admin/v1/auth/login",
      payload: {
        username: "other-admin",
        password: "other-admin-password"
      }
    });
    assert.equal(otherLogin.response.statusCode, 200, otherLogin.response.body);
    const otherSession = {
      token: otherLogin.body.data.token,
      organizationId: otherOrganization.id,
      organizationSlug: "other-org"
    };

    const otherBackendApi = await adminRequest(handle.app, otherSession, {
      method: "POST",
      url: "/api/admin/v1/backend-apis",
      payload: {
        organizationId: otherOrganization.id,
        name: "Other Backend",
        slug: "other-backend",
        defaultBaseUrl: "https://other.example.test",
        authType: "none",
        defaultTimeoutMs: 5000,
        retryPolicy: { retries: 0 },
        isActive: true
      }
    });
    assert.equal(otherBackendApi.response.statusCode, 200, otherBackendApi.response.body);

    const otherResource = await adminRequest(handle.app, otherSession, {
      method: "POST",
      url: "/api/admin/v1/backend-resources",
      payload: {
        backendApiId: otherBackendApi.body.data.id,
        name: "Other Resource",
        operationId: "otherResource",
        httpMethod: "POST",
        pathTemplate: "/other",
        requestSchema: {},
        responseSchema: {},
        isActive: true
      }
    });
    assert.equal(otherResource.response.statusCode, 200, otherResource.response.body);

    const result = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tools",
      payload: {
        mcpServerId: fixture.mcpServerId,
        name: "cross_org_tool",
        slug: "cross-org-tool",
        title: "Cross org tool",
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: true,
        scopeIds: [],
        mapping: {
          backendResourceId: otherResource.body.data.id
        }
      }
    });

    assert.equal(result.response.statusCode, 404, result.response.body);
    assert.equal(result.body.error.code, "backend_resource_not_found");
  } finally {
    await handle.close();
  }
});

test("tool updates preserve mappings when omitted, remove them with null, and replace deduplicated scopes", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://widgets.example.test");

    const scopeA = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/scopes",
      payload: {
        organizationId: session.organizationId,
        name: "widgets.alpha",
        description: "alpha",
        category: "runtime",
        isSensitive: false
      }
    });
    assert.equal(scopeA.response.statusCode, 200, scopeA.response.body);

    const scopeB = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/scopes",
      payload: {
        organizationId: session.organizationId,
        name: "widgets.beta",
        description: "beta",
        category: "runtime",
        isSensitive: false
      }
    });
    assert.equal(scopeB.response.statusCode, 200, scopeB.response.body);

    const preserve = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/tools/${fixture.toolId}`,
      payload: {
        description: "Updated description"
      }
    });
    assert.equal(preserve.response.statusCode, 200, preserve.response.body);
    assert.ok(preserve.body.data.mapping);
    assert.equal(preserve.body.data.mapping.backendResourceId, fixture.backendResourceId);

    const replaceScopes = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/tools/${fixture.toolId}`,
      payload: {
        scopeIds: [scopeA.body.data.id, scopeB.body.data.id, scopeA.body.data.id]
      }
    });
    assert.equal(replaceScopes.response.statusCode, 200, replaceScopes.response.body);

    const storedTool = await getTool(handle.app, session, fixture.toolId);
    assert.deepEqual(storedTool.scopeIds.sort(), [scopeA.body.data.id, scopeB.body.data.id].sort());

    const storedScopes = await handle.app.db
      .select()
      .from(toolScopes)
      .where(eq(toolScopes.toolId, fixture.toolId));
    assert.equal(storedScopes.length, 2);

    const removeMapping = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/tools/${fixture.toolId}`,
      payload: {
        mapping: null
      }
    });
    assert.equal(removeMapping.response.statusCode, 200, removeMapping.response.body);
    assert.equal(removeMapping.body.data.mapping, null);

    const storedMappings = await handle.app.db
      .select()
      .from(toolMappings)
      .where(eq(toolMappings.toolId, fixture.toolId));
    assert.equal(storedMappings.length, 0);
  } finally {
    await handle.close();
  }
});

test("backend API auth config creation and updates preserve or replace secrets correctly", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);

    const apiKeyApi = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/backend-apis",
      payload: {
        organizationId: session.organizationId,
        name: "API Key Backend",
        slug: "api-key-backend",
        defaultBaseUrl: "https://backend.example.test",
        authType: "api_key",
        apiKeyLocation: "header",
        apiKeyName: "x-api-key",
        apiKeyValue: "secret-1",
        defaultTimeoutMs: 5000,
        retryPolicy: { retries: 0 },
        isActive: true
      }
    });
    assert.equal(apiKeyApi.response.statusCode, 200, apiKeyApi.response.body);
    assert.equal(apiKeyApi.body.data.hasApiKeyValue, true);

    const preservedApiKey = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/backend-apis/${apiKeyApi.body.data.id}`,
      payload: {
        apiKeyName: "x-api-key-updated"
      }
    });
    assert.equal(preservedApiKey.response.statusCode, 200, preservedApiKey.response.body);

    const storedApiKey = await handle.app.db.query.backendApis.findFirst({
      where: eq(backendApis.id, apiKeyApi.body.data.id)
    });
    assert.equal(storedApiKey?.authType, "api_key");
    assert.equal((storedApiKey?.authConfig as Record<string, unknown>).name, "x-api-key-updated");
    assert.equal(typeof (storedApiKey?.authConfig as Record<string, unknown>).encryptedValue, "string");

    const tokenExchangeEnabled = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/backend-apis/${apiKeyApi.body.data.id}`,
      payload: {
        tokenExchangeEnabled: true,
        tokenExchangeAudience: "urn:widgets-api"
      }
    });
    assert.equal(tokenExchangeEnabled.response.statusCode, 200, tokenExchangeEnabled.response.body);
    assert.equal(tokenExchangeEnabled.body.data.tokenExchangeEnabled, true);
    assert.equal(tokenExchangeEnabled.body.data.tokenExchangeAudience, "urn:widgets-api");

    const switchedBearer = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/backend-apis/${apiKeyApi.body.data.id}`,
      payload: {
        authType: "bearer",
        bearerToken: "bearer-secret",
        tokenExchangeEnabled: false
      }
    });
    assert.equal(switchedBearer.response.statusCode, 200, switchedBearer.response.body);

    const storedBearer = await handle.app.db.query.backendApis.findFirst({
      where: eq(backendApis.id, apiKeyApi.body.data.id)
    });
    assert.equal(storedBearer?.authType, "bearer");
    assert.deepEqual(Object.keys((storedBearer?.authConfig as Record<string, unknown>) ?? {}), ["encryptedToken"]);

    const oauthApi = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/backend-apis",
      payload: {
        organizationId: session.organizationId,
        name: "OAuth Backend",
        slug: "oauth-backend",
        defaultBaseUrl: "https://oauth.example.test",
        authType: "oauth2",
        oauth2AccessToken: "oauth-secret",
        defaultTimeoutMs: 5000,
        retryPolicy: { retries: 0 },
        isActive: true
      }
    });
    assert.equal(oauthApi.response.statusCode, 200, oauthApi.response.body);
    assert.equal(oauthApi.body.data.hasOauth2AccessToken, true);

    const basicApi = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/backend-apis",
      payload: {
        organizationId: session.organizationId,
        name: "Basic Backend",
        slug: "basic-backend",
        defaultBaseUrl: "https://basic.example.test",
        authType: "basic",
        basicUsername: "alice",
        basicPassword: "p@ssword",
        defaultTimeoutMs: 5000,
        retryPolicy: { retries: 0 },
        isActive: true
      }
    });
    assert.equal(basicApi.response.statusCode, 200, basicApi.response.body);
    assert.equal(basicApi.body.data.basicUsername, "alice");
    assert.equal(basicApi.body.data.hasBasicPassword, true);
  } finally {
    await handle.close();
  }
});

test("backend API partial auth updates fail when required credentials are missing", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const created = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/backend-apis",
      payload: {
        organizationId: session.organizationId,
        name: "No Auth Backend",
        slug: "no-auth-backend",
        defaultBaseUrl: "https://backend.example.test",
        authType: "none",
        defaultTimeoutMs: 5000,
        retryPolicy: { retries: 0 },
        isActive: true
      }
    });
    assert.equal(created.response.statusCode, 200, created.response.body);

    const result = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/backend-apis/${created.body.data.id}`,
      payload: {
        authType: "bearer"
      }
    });

    assert.equal(result.response.statusCode, 400, result.response.body);
    assert.equal(result.body.error.code, "backend_api_bearer_invalid");
  } finally {
    await handle.close();
  }
});

test("security auth-server config can be created and updated, and protected publish is blocked until it exists", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    await createRuntimeFixture(handle.app, session, "https://widgets.example.test", { authType: "none" }, {
      accessMode: "protected",
      audience: "urn:widgets"
    });

    const invalidValidation = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/config/validate/${session.organizationId}`
    });
    assert.equal(invalidValidation.response.statusCode, 200, invalidValidation.response.body);
    assert.deepEqual(invalidValidation.body.data, {
      valid: false,
      issues: ["A protected MCP server requires an authorization server configuration"]
    });

    const blockedPublish = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/config/publish",
      payload: {
        organizationId: session.organizationId,
        notes: "blocked publish"
      }
    });
    assert.equal(blockedPublish.response.statusCode, 200, blockedPublish.response.body);
    assert.equal(blockedPublish.body.data.published, false);
    assert.deepEqual(blockedPublish.body.data.issues, [
      "A protected MCP server requires an authorization server configuration"
    ]);

    const createdConfig = await adminRequest(handle.app, session, {
      method: "PUT",
      url: "/api/admin/v1/security/auth-server",
      payload: {
        issuer: "https://issuer.example.test",
        jwksUri: "https://issuer.example.test/jwks.json",
        tokenEndpoint: "https://issuer.example.test/token",
        clientId: "gateway-client",
        clientSecret: "gateway-secret"
      }
    });
    assert.equal(createdConfig.response.statusCode, 200, createdConfig.response.body);
    assert.equal(createdConfig.body.data.tokenEndpoint, "https://issuer.example.test/token");
    assert.equal(createdConfig.body.data.clientId, "gateway-client");
    assert.equal(createdConfig.body.data.hasClientSecret, true);

    const updatedConfig = await adminRequest(handle.app, session, {
      method: "PUT",
      url: "/api/admin/v1/security/auth-server",
      payload: {
        issuer: "https://issuer.example.test/v2",
        jwksUri: "https://issuer.example.test/v2/jwks.json",
        tokenEndpoint: "https://issuer.example.test/v2/token",
        clientId: "gateway-client-v2"
      }
    });
    assert.equal(updatedConfig.response.statusCode, 200, updatedConfig.response.body);
    assert.equal(updatedConfig.body.data.issuer, "https://issuer.example.test/v2");
    assert.equal(updatedConfig.body.data.hasClientSecret, true);

    const snapshot = await validateAndPublish(handle.app, session);
    assert.equal(snapshot.version, 1);
  } finally {
    await handle.close();
  }
});

test("auth login rejects wrong passwords and inactive users", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);

    const wrongPassword = await request(handle.app, {
      method: "POST",
      url: "/api/admin/v1/auth/login",
      payload: {
        username: "admin",
        password: "wrong-password"
      }
    });
    assert.equal(wrongPassword.response.statusCode, 401, wrongPassword.response.body);
    assert.equal(wrongPassword.body.error.code, "invalid_credentials");

    const user = await createUser(handle.app, session, {
      organizationId: session.organizationId,
      username: "disabled-user",
      name: "Disabled User",
      role: "viewer",
      authMode: "local",
      password: "disabled-password",
      isActive: true
    });
    await updateUser(handle.app, session, user.id, { isActive: false });

    const inactiveUser = await request(handle.app, {
      method: "POST",
      url: "/api/admin/v1/auth/login",
      payload: {
        username: "disabled-user",
        password: "disabled-password"
      }
    });
    assert.equal(inactiveUser.response.statusCode, 401, inactiveUser.response.body);
    assert.equal(inactiveUser.body.error.code, "invalid_credentials");

    const storedUser = await handle.app.db.query.users.findFirst({
      where: eq(users.id, user.id)
    });
    assert.equal(storedUser?.isActive, false);
  } finally {
    await handle.close();
  }
});

test("tool and backend API list endpoints support search, isActive, pagination, and organization scoping", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://widgets.example.test");
    const secondTool = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tools",
      payload: {
        mcpServerId: fixture.mcpServerId,
        name: "beta_widget",
        slug: "beta-widget",
        title: "Beta Widget",
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: false,
        scopeIds: [],
        mapping: {
          backendResourceId: fixture.backendResourceId
        }
      }
    });
    assert.equal(secondTool.response.statusCode, 200, secondTool.response.body);

    const otherOrganization = await createOrganization(handle.app, session, {
      name: "Tenant Two",
      slug: "tenant-two"
    });
    const otherUser = await createUser(handle.app, session, {
      organizationId: otherOrganization.id,
      username: "tenant-admin",
      name: "Tenant Admin",
      role: "admin",
      authMode: "local",
      password: "tenant-pass-123",
      isActive: true
    });
    assert.ok(otherUser.id);

    const otherLogin = await request(handle.app, {
      method: "POST",
      url: "/api/admin/v1/auth/login",
      payload: {
        username: "tenant-admin",
        password: "tenant-pass-123"
      }
    });
    assert.equal(otherLogin.response.statusCode, 200, otherLogin.response.body);
    const otherSession = {
      token: otherLogin.body.data.token,
      organizationId: otherLogin.body.data.user.organizationId,
      organizationSlug: "tenant-two"
    };

    await createRuntimeFixture(handle.app, otherSession, "https://tenant-two.example.test");

    const toolSearch = await adminRequest(handle.app, session, {
      method: "GET",
      url: "/api/admin/v1/tools?search=echo&page=1&pageSize=10"
    });
    assert.equal(toolSearch.response.statusCode, 200, toolSearch.response.body);
    assert.deepEqual(toolSearch.body.data.map((tool: { name: string }) => tool.name), ["echo_widget"]);

    const toolActive = await adminRequest(handle.app, session, {
      method: "GET",
      url: "/api/admin/v1/tools?isActive=false&page=1&pageSize=10"
    });
    assert.equal(toolActive.response.statusCode, 200, toolActive.response.body);
    assert.deepEqual(toolActive.body.data.map((tool: { name: string }) => tool.name), ["beta_widget"]);

    const toolPage = await adminRequest(handle.app, session, {
      method: "GET",
      url: "/api/admin/v1/tools?page=2&pageSize=1"
    });
    assert.equal(toolPage.response.statusCode, 200, toolPage.response.body);
    assert.equal(toolPage.body.meta.pagination.total, 2);
    assert.equal(toolPage.body.data.length, 1);

    const backendApiSearch = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/backend-apis?organizationId=${session.organizationId}&search=stub&page=1&pageSize=10`
    });
    assert.equal(backendApiSearch.response.statusCode, 200, backendApiSearch.response.body);
    assert.deepEqual(
      backendApiSearch.body.data.map((api: { slug: string }) => api.slug),
      ["stub-backend"]
    );

    const backendApiIsolation = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/backend-apis?organizationId=${otherOrganization.id}&page=1&pageSize=10`
    });
    assert.equal(backendApiIsolation.response.statusCode, 200, backendApiIsolation.response.body);
    assert.equal(backendApiIsolation.body.data.length, 1);
  } finally {
    await handle.close();
  }
});

test("tool mappings support direct create, list, conflict, mismatch, and not-found flows", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);
    const fixture = await createRuntimeFixture(handle.app, session, "https://widgets.example.test");

    const secondTool = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tools",
      payload: {
        mcpServerId: fixture.mcpServerId,
        name: "mapped_widget",
        slug: "mapped-widget",
        title: "Mapped Widget",
        inputSchema: {},
        outputSchema: {},
        examples: [],
        riskLevel: "low",
        isActive: true,
        scopeIds: []
      }
    });
    assert.equal(secondTool.response.statusCode, 200, secondTool.response.body);

    const created = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tool-mappings",
      payload: {
        toolId: secondTool.body.data.id,
        backendApiId: fixture.backendApiId,
        backendResourceId: fixture.backendResourceId,
        requestMapping: { field: "name" },
        responseMapping: { result: "ok" },
        errorMapping: { error: "message" },
        authStrategy: "inherit",
        timeoutOverrideMs: 1234,
        retryOverride: { retries: 2 },
        isActive: false
      }
    });
    assert.equal(created.response.statusCode, 200, created.response.body);
    assert.equal(created.body.data.toolId, secondTool.body.data.id);
    assert.equal(created.body.data.backendApiId, fixture.backendApiId);
    assert.equal(created.body.data.timeoutOverrideMs, 1234);
    assert.equal(created.body.data.isActive, false);

    const listed = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/tool-mappings?toolId=${secondTool.body.data.id}&page=1&pageSize=10`
    });
    assert.equal(listed.response.statusCode, 200, listed.response.body);
    assert.equal(listed.body.meta.pagination.total, 1);
    assert.deepEqual(
      listed.body.data.map((mapping: { id: string }) => mapping.id),
      [created.body.data.id]
    );

    const conflict = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tool-mappings",
      payload: {
        toolId: secondTool.body.data.id,
        backendResourceId: fixture.backendResourceId
      }
    });
    assert.equal(conflict.response.statusCode, 409, conflict.response.body);
    assert.equal(conflict.body.error.code, "tool_mapping_conflict");

    const alternateBackendApi = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/backend-apis",
      payload: {
        organizationId: session.organizationId,
        name: "Alternate Backend",
        slug: "alternate-backend",
        defaultBaseUrl: "https://alternate.example.test",
        authType: "none",
        defaultTimeoutMs: 5000,
        retryPolicy: { retries: 0 },
        isActive: true
      }
    });
    assert.equal(alternateBackendApi.response.statusCode, 200, alternateBackendApi.response.body);

    const alternateResource = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/backend-resources",
      payload: {
        backendApiId: alternateBackendApi.body.data.id,
        name: "Alternate Resource",
        operationId: "alternateResource",
        httpMethod: "GET",
        pathTemplate: "/alternate",
        requestSchema: {},
        responseSchema: {},
        isActive: true
      }
    });
    assert.equal(alternateResource.response.statusCode, 200, alternateResource.response.body);

    const mismatch = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/tool-mappings",
      payload: {
        toolId: secondTool.body.data.id,
        backendApiId: fixture.backendApiId,
        backendResourceId: alternateResource.body.data.id
      }
    });
    assert.equal(mismatch.response.statusCode, 400, mismatch.response.body);
    assert.equal(mismatch.body.error.code, "backend_api_resource_mismatch");

    const updateConflict = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/tool-mappings/${created.body.data.id}`,
      payload: {
        toolId: fixture.toolId
      }
    });
    assert.equal(updateConflict.response.statusCode, 409, updateConflict.response.body);
    assert.equal(updateConflict.body.error.code, "tool_mapping_conflict");

    const updateSuccess = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/tool-mappings/${created.body.data.id}`,
      payload: {
        backendApiId: alternateBackendApi.body.data.id,
        backendResourceId: alternateResource.body.data.id,
        authStrategy: "override",
        isActive: true
      }
    });
    assert.equal(updateSuccess.response.statusCode, 200, updateSuccess.response.body);
    assert.equal(updateSuccess.body.data.backendApiId, alternateBackendApi.body.data.id);
    assert.equal(updateSuccess.body.data.backendResourceId, alternateResource.body.data.id);
    assert.equal(updateSuccess.body.data.authStrategy, "override");
    assert.equal(updateSuccess.body.data.isActive, true);

    const missing = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: "/api/admin/v1/tool-mappings/11111111-1111-1111-1111-111111111111",
      payload: {
        isActive: false
      }
    });
    assert.equal(missing.response.statusCode, 404, missing.response.body);
    assert.equal(missing.body.error.code, "tool_mapping_not_found");
  } finally {
    await handle.close();
  }
});

test("secrets create encrypted values, mask responses, paginate lists, and enforce admin-only access", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);

    const createdDatabaseSecret = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/secrets",
      payload: {
        organizationId: session.organizationId,
        name: "Widget API Key",
        description: "Primary widget API key",
        secretType: "api_key",
        storageMode: "database",
        plaintextValue: "super-secret-value",
        keyVersion: 2,
        metadata: {
          env: "test"
        }
      }
    });
    assert.equal(createdDatabaseSecret.response.statusCode, 200, createdDatabaseSecret.response.body);
    assert.equal(createdDatabaseSecret.body.data.hasValue, true);
    assert.equal(createdDatabaseSecret.body.data.plaintextValue, undefined);
    assert.equal(createdDatabaseSecret.body.data.encryptedValue, undefined);

    const storedDatabaseSecret = await handle.app.db.query.secrets.findFirst({
      where: eq(secrets.id, createdDatabaseSecret.body.data.id)
    });
    assert.equal(storedDatabaseSecret?.storageMode, "database");
    assert.equal(storedDatabaseSecret?.keyVersion, 2);
    assert.equal(typeof storedDatabaseSecret?.encryptedValue, "string");
    assert.notEqual(storedDatabaseSecret?.encryptedValue, "super-secret-value");

    const createdExternalSecret = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/secrets",
      payload: {
        organizationId: session.organizationId,
        name: "Widget Vault Ref",
        secretType: "token",
        storageMode: "external_ref",
        externalRef: "vault://kv/widgets/token",
        metadata: {}
      }
    });
    assert.equal(createdExternalSecret.response.statusCode, 200, createdExternalSecret.response.body);
    assert.equal(createdExternalSecret.body.data.hasValue, false);
    assert.equal(createdExternalSecret.body.data.externalRef, "vault://kv/widgets/token");

    const listed = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/secrets?organizationId=${session.organizationId}&search=Widget&page=1&pageSize=1`
    });
    assert.equal(listed.response.statusCode, 200, listed.response.body);
    assert.equal(listed.body.meta.pagination.total, 2);
    assert.equal(listed.body.data.length, 1);

    const editor = await createUser(handle.app, session, {
      organizationId: session.organizationId,
      username: "secret-editor",
      name: "Secret Editor",
      role: "editor",
      authMode: "local",
      password: "secret-editor-pass",
      isActive: true
    });
    assert.ok(editor.id);

    const editorLogin = await request(handle.app, {
      method: "POST",
      url: "/api/admin/v1/auth/login",
      payload: {
        username: "secret-editor",
        password: "secret-editor-pass"
      }
    });
    assert.equal(editorLogin.response.statusCode, 200, editorLogin.response.body);

    const forbidden = await request(handle.app, {
      method: "GET",
      url: `/api/admin/v1/secrets?organizationId=${session.organizationId}&page=1&pageSize=10`,
      token: editorLogin.body.data.token
    });
    assert.equal(forbidden.response.statusCode, 403, forbidden.response.body);
  } finally {
    await handle.close();
  }
});

test("mcp servers support list, update, delete, and not-found behavior", async () => {
  const handle = await createTestApp();
  try {
    const session = await loginAsBootstrapAdmin(handle.app);

    const primary = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/mcp-servers",
      payload: {
        organizationId: session.organizationId,
        name: "Catalog Server",
        slug: "catalog-server",
        version: "1.0.0",
        authMode: "local",
        accessMode: "public",
        isActive: true
      }
    });
    assert.equal(primary.response.statusCode, 200, primary.response.body);

    const secondary = await adminRequest(handle.app, session, {
      method: "POST",
      url: "/api/admin/v1/mcp-servers",
      payload: {
        organizationId: session.organizationId,
        name: "Dormant Server",
        slug: "dormant-server",
        version: "1.0.0",
        authMode: "local",
        accessMode: "public",
        isActive: false
      }
    });
    assert.equal(secondary.response.statusCode, 200, secondary.response.body);

    const searched = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/mcp-servers?organizationId=${session.organizationId}&search=Catalog&page=1&pageSize=10`
    });
    assert.equal(searched.response.statusCode, 200, searched.response.body);
    assert.deepEqual(
      searched.body.data.map((server: { slug: string }) => server.slug),
      ["catalog-server"]
    );

    const inactive = await adminRequest(handle.app, session, {
      method: "GET",
      url: `/api/admin/v1/mcp-servers?organizationId=${session.organizationId}&isActive=false&page=1&pageSize=10`
    });
    assert.equal(inactive.response.statusCode, 200, inactive.response.body);
    assert.deepEqual(
      inactive.body.data.map((server: { slug: string }) => server.slug),
      ["dormant-server"]
    );

    const updated = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: `/api/admin/v1/mcp-servers/${primary.body.data.id}`,
      payload: {
        accessMode: "protected",
        audience: "urn:catalog",
        name: "Catalog Server Protected"
      }
    });
    assert.equal(updated.response.statusCode, 200, updated.response.body);
    assert.equal(updated.body.data.accessMode, "protected");
    assert.equal(updated.body.data.audience, "urn:catalog");
    assert.equal(updated.body.data.name, "Catalog Server Protected");

    const missingUpdate = await adminRequest(handle.app, session, {
      method: "PATCH",
      url: "/api/admin/v1/mcp-servers/11111111-1111-1111-1111-111111111111",
      payload: {
        name: "Missing"
      }
    });
    assert.equal(missingUpdate.response.statusCode, 404, missingUpdate.response.body);
    assert.equal(missingUpdate.body.error.code, "mcp_server_not_found");

    const deleted = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: `/api/admin/v1/mcp-servers/${secondary.body.data.id}`
    });
    assert.equal(deleted.response.statusCode, 200, deleted.response.body);
    assert.equal(deleted.body.data.id, secondary.body.data.id);

    const missingDelete = await adminRequest(handle.app, session, {
      method: "DELETE",
      url: "/api/admin/v1/mcp-servers/11111111-1111-1111-1111-111111111111"
    });
    assert.equal(missingDelete.response.statusCode, 404, missingDelete.response.body);
    assert.equal(missingDelete.body.error.code, "mcp_server_not_found");
  } finally {
    await handle.close();
  }
});
