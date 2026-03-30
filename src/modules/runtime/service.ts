import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AppError } from "../../lib/errors.js";
import { decryptSecret } from "../../lib/crypto.js";
import { runtimeRepository } from "./repository.js";

const MCP_PROTOCOL_VERSION = "2024-11-05";

type JsonObject = Record<string, unknown>;

type SnapshotAuthServerConfig = {
  id: string;
  organizationId: string;
  issuer: string;
  jwksUri: string;
  authorizationServerMetadataUrl?: string | null;
};

type SnapshotBackendApi = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  defaultBaseUrl: string;
  authType: string;
  authConfig: JsonObject;
  defaultTimeoutMs: number;
  retryPolicy: JsonObject;
  isActive: boolean;
};

type SnapshotBackendResource = {
  id: string;
  backendApiId: string;
  name: string;
  operationId: string;
  description: string | null;
  httpMethod: string;
  pathTemplate: string;
  bodyTemplate: string | null;
  requestSchema: JsonObject;
  responseSchema: JsonObject;
  isActive: boolean;
};

type SnapshotMcpServer = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  version: string;
  title: string;
  description: string | null;
  authMode: string;
  accessMode: string;
  audience: string | null;
  isActive: boolean;
};

type SnapshotTool = {
  id: string;
  mcpServerId: string;
  name: string;
  slug: string;
  title: string;
  description: string | null;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  examples: unknown[];
  riskLevel: string;
  isActive: boolean;
};

type SnapshotToolMapping = {
  id: string;
  toolId: string;
  backendApiId: string;
  backendResourceId: string;
  requestMapping: JsonObject;
  responseMapping: JsonObject;
  errorMapping: JsonObject;
  authStrategy: string;
  timeoutOverrideMs: number | null;
  retryOverride: JsonObject | null;
  isActive: boolean;
};

type SnapshotScope = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  category: string | null;
  isSensitive: boolean;
};

type SnapshotToolScope = {
  toolId: string;
  scopeId: string;
};

type RuntimeSnapshot = {
  version: number;
  generatedAt: string;
  authServerConfig: SnapshotAuthServerConfig | null;
  backendApis: SnapshotBackendApi[];
  backendResources: SnapshotBackendResource[];
  mcpServers: SnapshotMcpServer[];
  tools: SnapshotTool[];
  scopes: SnapshotScope[];
  toolMappings: SnapshotToolMapping[];
  toolScopes: SnapshotToolScope[];
};

type CompiledRuntimeTool = {
  tool: SnapshotTool;
  mapping: SnapshotToolMapping;
  backendApi: SnapshotBackendApi;
  backendResource: SnapshotBackendResource;
  requiredScopes: string[];
};

type CompiledRuntimeServer = {
  organizationId: string;
  organizationSlug: string;
  snapshotVersion: number;
  generatedAt: string;
  authServerConfig: SnapshotAuthServerConfig | null;
  server: SnapshotMcpServer;
  toolsByName: Map<string, CompiledRuntimeTool>;
  tools: CompiledRuntimeTool[];
  requiredScopes: string[];
};

type RuntimeCacheEntry = {
  organizationId: string;
  snapshotVersion: number;
  serversBySlug: Map<string, CompiledRuntimeServer>;
};

const runtimeCache = new Map<string, RuntimeCacheEntry>();

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};

const parseRetryCount = (value: unknown) => {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { retries?: unknown }).retries
      : undefined;
  return typeof candidate === "number" && candidate >= 0 ? candidate : 0;
};

const templateKeyPattern = "[a-zA-Z_][a-zA-Z0-9_-]*";
const getResolvedSecret = (authConfig: JsonObject, encryptedKey: string, legacyKey: string) => {
  const encrypted = authConfig[encryptedKey];
  if (typeof encrypted === "string" && encrypted.length > 0) {
    return decryptSecret(encrypted);
  }

  const legacy = authConfig[legacyKey];
  return typeof legacy === "string" && legacy.length > 0 ? legacy : undefined;
};

const interpolateString = (template: string, input: JsonObject) =>
  template
    .replace(new RegExp(`{{\\s*(${templateKeyPattern})\\s*}}`, "g"), (_match, key: string) => {
      const value = input[key];
      if (value === undefined || value === null) {
        throw new AppError(400, `Missing tool input: ${key}`, "missing_tool_input");
      }
      return String(value);
    })
    .replace(new RegExp(`\\$(${templateKeyPattern})`, "g"), (_match, key: string) => {
      const value = input[key];
      if (value === undefined || value === null) {
        throw new AppError(400, `Missing tool input: ${key}`, "missing_tool_input");
      }
      return String(value);
    });

const renderPathTemplate = (template: string, input: JsonObject) =>
  interpolateString(
    template.replace(new RegExp(`(?<!\\{)\\{(${templateKeyPattern})\\}(?!\\})`, "g"), "{{$1}}"),
    input
  );

const replaceRawPlaceholders = (template: string, input: JsonObject) => {
  let inString = false;
  let escaped = false;
  let index = 0;
  let result = "";

  while (index < template.length) {
    const current = template[index];
    if (current === undefined) {
      break;
    }

    if (escaped) {
      result += current;
      escaped = false;
      index += 1;
      continue;
    }

    if (current === "\\") {
      result += current;
      escaped = true;
      index += 1;
      continue;
    }

    if (current === "\"") {
      result += current;
      inString = !inString;
      index += 1;
      continue;
    }

    if (!inString && current === "{" && template[index + 1] === "{") {
      const end = template.indexOf("}}", index + 2);
      if (end !== -1) {
        const key = template.slice(index + 2, end).trim();
        if (new RegExp(`^${templateKeyPattern}$`).test(key)) {
          const value = input[key];
          if (value === undefined) {
            throw new AppError(400, `Missing tool input: ${key}`, "missing_tool_input");
          }
          result += JSON.stringify(value);
          index = end + 2;
          continue;
        }
      }
    }

    if (!inString && current === "$") {
      const match = template.slice(index).match(new RegExp(`^\\$(${templateKeyPattern})`));
      if (match?.[1]) {
        const key = match[1];
        const value = input[key];
        if (value === undefined) {
          throw new AppError(400, `Missing tool input: ${key}`, "missing_tool_input");
        }
        result += JSON.stringify(value);
        index += key.length + 1;
        continue;
      }
    }

    result += current;
    index += 1;
  }

  return result;
};

const interpolateObjectStrings = (value: unknown, input: JsonObject): unknown => {
  if (typeof value === "string") {
    return interpolateString(value, input);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateObjectStrings(item, input));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        interpolateObjectStrings(entryValue, input)
      ])
    );
  }
  return value;
};

const renderBodyTemplate = (template: string, input: JsonObject): unknown => {
  const parsed = JSON.parse(replaceRawPlaceholders(template, input)) as unknown;
  return interpolateObjectStrings(parsed, input);
};

const joinUrl = (baseUrl: string, path: string) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.startsWith("/") ? path.slice(1) : path, normalizedBase);
};

const applyAuthConfig = (targetUrl: URL, headers: Headers, backendApi: SnapshotBackendApi) => {
  const authConfig = asObject(backendApi.authConfig);

  switch (backendApi.authType) {
    case "bearer":
    case "oauth2": {
      const token =
        getResolvedSecret(authConfig, "encryptedToken", "token") ??
        getResolvedSecret(authConfig, "encryptedAccessToken", "accessToken") ??
        getResolvedSecret(authConfig, "encryptedToken", "accessToken");
      if (typeof token === "string" && token.length > 0) {
        headers.set("authorization", `Bearer ${token}`);
      }
      break;
    }
    case "basic": {
      const username = authConfig.username;
      const password = getResolvedSecret(authConfig, "encryptedPassword", "password");
      if (typeof username === "string" && typeof password === "string") {
        headers.set(
          "authorization",
          `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
        );
      }
      break;
    }
    case "api_key": {
      const name = typeof authConfig.name === "string" ? authConfig.name : "x-api-key";
      const value = getResolvedSecret(authConfig, "encryptedValue", "value");
      const placement = authConfig.in === "query" ? "query" : "header";
      if (typeof value === "string" && value.length > 0) {
        if (placement === "query") {
          targetUrl.searchParams.set(name, value);
        } else {
          headers.set(name, value);
        }
      }
      break;
    }
    default:
      break;
  }
};

const normalizeToolArguments = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
};

const parseBackendResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();
  return text;
};

const createContentBlocks = (value: unknown) => {
  if (typeof value === "string") {
    return [{ type: "text", text: value }];
  }

  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
};

const redactUrlForLog = (url: URL, backendApi: SnapshotBackendApi) => {
  const authConfig = asObject(backendApi.authConfig);
  if (backendApi.authType !== "api_key" || authConfig.in !== "query" || typeof authConfig.name !== "string") {
    return url.toString();
  }

  const redacted = new URL(url.toString());
  if (redacted.searchParams.has(authConfig.name)) {
    redacted.searchParams.set(authConfig.name, "[redacted]");
  }
  return redacted.toString();
};

const compileSnapshot = (
  organizationSlug: string,
  snapshot: RuntimeSnapshot
): Map<string, CompiledRuntimeServer> => {
  const backendApis = snapshot.backendApis.filter((row) => row.isActive);
  const backendResources = snapshot.backendResources.filter((row) => row.isActive);
  const mcpServers = snapshot.mcpServers.filter((row) => row.isActive);
  const tools = snapshot.tools.filter((row) => row.isActive);
  const toolMappings = snapshot.toolMappings.filter((row) => row.isActive);
  const scopes = snapshot.scopes;
  const toolScopes = snapshot.toolScopes;

  const backendApisById = new Map(backendApis.map((row) => [row.id, row]));
  const backendResourcesById = new Map(backendResources.map((row) => [row.id, row]));
  const mappingsByToolId = new Map(toolMappings.map((row) => [row.toolId, row]));
  const scopesById = new Map(scopes.map((row) => [row.id, row]));
  const scopeNamesByToolId = new Map<string, string[]>();
  for (const row of toolScopes) {
    const scope = scopesById.get(row.scopeId);
    if (!scope) {
      continue;
    }
    const current = scopeNamesByToolId.get(row.toolId) ?? [];
    current.push(scope.name);
    scopeNamesByToolId.set(row.toolId, current);
  }
  const toolsByServerId = new Map<string, CompiledRuntimeTool[]>();

  for (const tool of tools) {
    const mapping = mappingsByToolId.get(tool.id);
    if (!mapping) {
      continue;
    }
    const backendApi = backendApisById.get(mapping.backendApiId);
    const backendResource = backendResourcesById.get(mapping.backendResourceId);
    if (!backendApi || !backendResource) {
      continue;
    }

    const current = toolsByServerId.get(tool.mcpServerId) ?? [];
    current.push({
      tool,
      mapping,
      backendApi,
      backendResource,
      requiredScopes: Array.from(new Set(scopeNamesByToolId.get(tool.id) ?? []))
    });
    toolsByServerId.set(tool.mcpServerId, current);
  }

  const serversBySlug = new Map<string, CompiledRuntimeServer>();
  for (const server of mcpServers) {
    const serverTools = toolsByServerId.get(server.id) ?? [];
    serversBySlug.set(server.slug, {
      organizationId: server.organizationId,
      organizationSlug,
      snapshotVersion: snapshot.version,
      generatedAt: snapshot.generatedAt,
      authServerConfig: snapshot.authServerConfig,
      server,
      tools: serverTools,
      toolsByName: new Map(serverTools.map((entry) => [entry.tool.name, entry])),
      requiredScopes: Array.from(new Set(serverTools.flatMap((entry) => entry.requiredScopes)))
    });
  }

  return serversBySlug;
};

const parseSnapshotJson = (value: unknown): RuntimeSnapshot => {
  const object = asObject(value);
  return {
    version: typeof object.version === "number" ? object.version : 0,
    generatedAt: typeof object.generatedAt === "string" ? object.generatedAt : new Date().toISOString(),
    authServerConfig: object.authServerConfig ? (object.authServerConfig as SnapshotAuthServerConfig) : null,
    backendApis: Array.isArray(object.backendApis) ? (object.backendApis as SnapshotBackendApi[]) : [],
    backendResources: Array.isArray(object.backendResources) ? (object.backendResources as SnapshotBackendResource[]) : [],
    mcpServers: Array.isArray(object.mcpServers) ? (object.mcpServers as SnapshotMcpServer[]) : [],
    tools: Array.isArray(object.tools) ? (object.tools as SnapshotTool[]) : [],
    scopes: Array.isArray(object.scopes) ? (object.scopes as SnapshotScope[]) : [],
    toolMappings: Array.isArray(object.toolMappings) ? (object.toolMappings as SnapshotToolMapping[]) : [],
    toolScopes: Array.isArray(object.toolScopes) ? (object.toolScopes as SnapshotToolScope[]) : []
  };
};

const getCompiledOrganizationRuntime = async (
  app: FastifyInstance,
  organizationSlug: string
) => {
  const organization = await runtimeRepository.getOrganizationBySlug(app, organizationSlug);
  if (!organization) {
    throw new AppError(404, "Organization not found", "organization_not_found");
  }

  const latestMeta = await runtimeRepository.getLatestPublishedSnapshotMeta(app, organization.id);
  if (!latestMeta) {
    throw new AppError(404, "No published runtime snapshot found", "runtime_snapshot_not_found");
  }

  const cached = runtimeCache.get(organization.slug);
  if (cached && cached.organizationId === organization.id && cached.snapshotVersion === latestMeta.version) {
    return cached;
  }

  const snapshotRow = await runtimeRepository.getLatestPublishedSnapshot(app, organization.id);
  if (!snapshotRow) {
    throw new AppError(404, "No published runtime snapshot found", "runtime_snapshot_not_found");
  }

  const compiled = {
    organizationId: organization.id,
    snapshotVersion: snapshotRow.version,
    serversBySlug: compileSnapshot(organization.slug, parseSnapshotJson(snapshotRow.snapshotJson))
  };

  runtimeCache.set(organization.slug, compiled);
  app.log.info(
    { organizationSlug: organization.slug, version: snapshotRow.version },
    "runtime snapshot cache refreshed"
  );

  return compiled;
};

const callBackend = async (
  app: FastifyInstance,
  server: CompiledRuntimeServer,
  runtimeTool: CompiledRuntimeTool,
  input: JsonObject
) => {
  const requestId = randomUUID();
  const traceId = randomUUID();
  const startedAt = Date.now();

  const { backendApi, backendResource, mapping } = runtimeTool;
  const url = joinUrl(
    backendApi.defaultBaseUrl,
    renderPathTemplate(backendResource.pathTemplate, input)
  );
  const headers = new Headers({
    accept: "application/json"
  });

  let body: string | undefined;
  if (backendResource.bodyTemplate && ["POST", "PUT", "PATCH"].includes(backendResource.httpMethod.toUpperCase())) {
    const renderedBody = renderBodyTemplate(backendResource.bodyTemplate, input);
    body = JSON.stringify(renderedBody);
    headers.set("content-type", "application/json");
  }

  applyAuthConfig(url, headers, backendApi);
  const loggedUrl = redactUrlForLog(url, backendApi);

  const retries = Math.max(
    parseRetryCount(backendApi.retryPolicy),
    parseRetryCount(mapping.retryOverride)
  );
  const timeoutMs = mapping.timeoutOverrideMs ?? backendApi.defaultTimeoutMs ?? 30000;

  let lastError: unknown;
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const currentAttempt = attempt + 1;

    try {
      const requestInit: RequestInit = {
        method: backendResource.httpMethod.toUpperCase(),
        headers,
        signal: controller.signal
      };
      if (body !== undefined) {
        requestInit.body = body;
      }

      app.log.info(
        `${requestId} backend request ${requestInit.method} ${loggedUrl} attempt=${currentAttempt}/${retries + 1} timeout=${timeoutMs}ms`
      );

      const response = await fetch(url, requestInit);
      clearTimeout(timeoutHandle);

      const output = await parseBackendResponse(response);
      const latencyMs = Date.now() - startedAt;

      app.log.info(
        response.ok
          ? `${requestId} backend response ${response.status} ${requestInit.method} ${loggedUrl} ${latencyMs}ms`
          : `${requestId} backend response ${response.status} ${requestInit.method} ${loggedUrl} ${latencyMs}ms error`
      );

      await runtimeRepository.insertExecutionLog(app, {
        organizationId: server.organizationId,
        mcpServerId: server.server.id,
        toolId: runtimeTool.tool.id,
        requestId,
        traceId,
        status: response.ok ? "success" : "error",
        backendStatus: response.status,
        latencyMs,
        inputPayload: input,
        outputPayload: response.ok ? output : null,
        errorPayload: response.ok
          ? null
          : {
              status: response.status,
              body: output
            }
      });

      if (!response.ok) {
        return {
          content: createContentBlocks(output),
          structuredContent: typeof output === "object" && output !== null ? output : undefined,
          isError: true as const
        };
      }

      return {
        content: createContentBlocks(output),
        structuredContent: output,
        isError: false as const
      };
    } catch (error) {
      clearTimeout(timeoutHandle);
      lastError = error;
      app.log.error(
        {
          organizationId: server.organizationId,
          mcpServerSlug: server.server.slug,
          toolName: runtimeTool.tool.name,
          backendApi: backendApi.name,
          backendResource: backendResource.operationId,
          method: backendResource.httpMethod.toUpperCase(),
          url: url.toString(),
          timeoutMs,
          retries,
          attempt: currentAttempt,
          err: error
        },
        "backend request failed before a response was received"
      );
      attempt += 1;
      if (attempt > retries) {
        break;
      }
    }
  }

  const latencyMs = Date.now() - startedAt;
  await runtimeRepository.insertExecutionLog(app, {
    organizationId: server.organizationId,
    mcpServerId: server.server.id,
    toolId: runtimeTool.tool.id,
    requestId,
    traceId,
    status: "error",
    backendStatus: null,
    latencyMs,
    inputPayload: input,
    outputPayload: null,
    errorPayload: {
      message: lastError instanceof Error ? lastError.message : "Backend request failed"
    }
  });

  return {
    content: createContentBlocks(lastError instanceof Error ? lastError.message : "Backend request failed"),
    structuredContent: {
      error: lastError instanceof Error ? lastError.message : "Backend request failed"
    },
    isError: true as const
  };
};

export const runtimeService = {
  async getServer(app: FastifyInstance, organizationSlug: string, serverSlug: string) {
    const compiled = await getCompiledOrganizationRuntime(app, organizationSlug);
    const server = compiled.serversBySlug.get(serverSlug);
    if (!server) {
      throw new AppError(404, "MCP server not found", "mcp_runtime_server_not_found");
    }
    return server;
  },

  async initialize(app: FastifyInstance, organizationSlug: string, serverSlug: string) {
    const runtimeServer = await this.getServer(app, organizationSlug, serverSlug);
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false
        }
      },
      serverInfo: {
        name: runtimeServer.server.slug,
        title: runtimeServer.server.title,
        version: runtimeServer.server.version
      }
    };
  },

  async listTools(app: FastifyInstance, organizationSlug: string, serverSlug: string) {
    const runtimeServer = await this.getServer(app, organizationSlug, serverSlug);
    return {
      tools: runtimeServer.tools.map(({ tool }) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description ?? undefined,
        inputSchema: asObject(tool.inputSchema),
        outputSchema: asObject(tool.outputSchema),
        annotations: {
          riskLevel: tool.riskLevel,
          scopes: runtimeServer.toolsByName.get(tool.name)?.requiredScopes ?? []
        }
      }))
    };
  },

  async callTool(
    app: FastifyInstance,
    organizationSlug: string,
    serverSlug: string,
    toolName: string,
    rawArguments: unknown
  ) {
    const runtimeServer = await this.getServer(app, organizationSlug, serverSlug);
    const runtimeTool = runtimeServer.toolsByName.get(toolName);
    if (!runtimeTool) {
      throw new AppError(404, `Tool ${toolName} not found`, "tool_not_found");
    }

    return callBackend(app, runtimeServer, runtimeTool, normalizeToolArguments(rawArguments));
  },

  invalidateOrganizationCache(organizationSlug: string) {
    runtimeCache.delete(organizationSlug);
  },

  createSdkServer(
    app: FastifyInstance,
    runtimeServer: CompiledRuntimeServer
  ) {
    const server = new Server(
      {
        name: runtimeServer.server.slug,
        version: runtimeServer.server.version
      },
      {
        capabilities: {
          tools: {
            listChanged: false
          }
        }
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () =>
      this.listTools(app, runtimeServer.organizationSlug, runtimeServer.server.slug)
    );

    server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.callTool(
        app,
        runtimeServer.organizationSlug,
        runtimeServer.server.slug,
        request.params.name,
        request.params.arguments
      )
    );

    return server;
  }
};
