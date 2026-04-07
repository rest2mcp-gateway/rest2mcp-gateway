import {
  clearStoredSession,
  emitUnauthorizedEvent,
  getStoredSession,
  type AuthUser,
  type EnvConfig
} from "@/lib/auth";
import { adminApiPaths } from "@/contracts/admin-api";
import type {
  AdminMethod,
  AdminPath,
  AuthServerConfig,
  AuthServerConfigFormData,
  BackendApi,
  BackendApiFormData,
  BackendResource,
  BackendResourceFormData,
  ConfigValidationResult,
  McpServer,
  McpServerFormData,
  OpenApiImportPreview,
  OpenApiImportResult,
  Organization,
  PaginatedResult,
  PaginationMeta,
  PublishResult,
  RuntimeSnapshot,
  Scope,
  ScopeFormData,
  Tool,
  ToolFormData,
  ToolMapping,
  ToolMappingFormData,
  QueryParams,
  RequestBody as ContractRequestBody,
  ResponseContent,
  ResponseData as ContractResponseData
} from "@/contracts/admin-api";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/admin/v1";
const MCP_BASE = import.meta.env.VITE_MCP_BASE_URL || window.location.origin;

type LoginResponse = ContractResponseData<"/auth/login", "post">;
type MeResponse = ContractResponseData<"/auth/me", "get">;
type PrimitiveQuery = Record<string, string | number | boolean | undefined | null>;
type ArrayItem<T> = T extends Array<infer Item> ? Item : never;

const getAccessToken = () => getStoredSession()?.accessToken ?? null;
const getOrganizationId = () => getStoredSession()?.user.organizationId ?? null;
const defaultPageSize = 10;
const requireOrganizationId = () => {
  const organizationId = getOrganizationId();
  if (!organizationId) {
    throw new Error("No organization is available for the current session.");
  }
  return organizationId;
};

const normalizeBackendApiPayload = (data: Partial<BackendApiFormData>) => {
  const payload: Record<string, unknown> = {
    name: data.name,
    slug: data.slug,
    description: data.description,
    defaultBaseUrl: data.defaultBaseUrl,
    authType: data.authType,
    defaultTimeoutMs: data.defaultTimeoutMs ?? 5000,
    retryPolicy: data.retryPolicy ?? { retries: 0 },
    isActive: data.isActive ?? true
  };

  switch (data.authType) {
    case "api_key":
      payload.apiKeyLocation = data.apiKeyLocation;
      payload.apiKeyName = data.apiKeyName;
      if (data.apiKeyValue && data.apiKeyValue.trim().length > 0) {
        payload.apiKeyValue = data.apiKeyValue;
      }
      break;
    case "bearer":
      if (data.bearerToken && data.bearerToken.trim().length > 0) {
        payload.bearerToken = data.bearerToken;
      }
      break;
    case "basic":
      payload.basicUsername = data.basicUsername;
      if (data.basicPassword && data.basicPassword.trim().length > 0) {
        payload.basicPassword = data.basicPassword;
      }
      break;
    case "oauth2":
      if (data.oauth2AccessToken && data.oauth2AccessToken.trim().length > 0) {
        payload.oauth2AccessToken = data.oauth2AccessToken;
      }
      break;
    default:
      break;
  }

  return payload;
};

const withQuery = (path: string, query?: PrimitiveQuery) => {
  if (!query) {
    return path;
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  const serialized = search.toString();
  return serialized ? `${path}?${serialized}` : path;
};

async function requestAdminContent<Path extends AdminPath, Method extends AdminMethod<Path>>(
  _schemaPath: Path,
  path: string,
  options: {
    method: Method;
    query?: QueryParams<Path, Method>;
    body?: ContractRequestBody<Path, Method>;
    headers?: HeadersInit;
    includeAuth?: boolean;
    handleUnauthorized?: boolean;
  }
): Promise<ResponseContent<Path, Method>> {
  const accessToken = options.includeAuth === false ? null : getAccessToken();
  const hasBody = options.body !== undefined && options.body !== null;
  const res = await fetch(`${API_BASE}${withQuery(path, options.query as PrimitiveQuery | undefined)}`, {
    method: options.method.toUpperCase(),
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers
    },
    body: hasBody ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401 && options.handleUnauthorized !== false) {
    clearStoredSession();
    emitUnauthorizedEvent();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  if (res.status === 204) {
    return undefined as ResponseContent<Path, Method>;
  }

  return res.json() as Promise<ResponseContent<Path, Method>>;
}

async function requestAdmin<Path extends AdminPath, Method extends AdminMethod<Path>>(
  schemaPath: Path,
  path: string,
  options: {
    method: Method;
    query?: QueryParams<Path, Method>;
    body?: ContractRequestBody<Path, Method>;
    headers?: HeadersInit;
    includeAuth?: boolean;
    handleUnauthorized?: boolean;
  }
): Promise<ContractResponseData<Path, Method>> {
  const content = await requestAdminContent(schemaPath, path, options);
  return content.data;
}

async function requestAdminPaginated<Path extends AdminPath>(
  schemaPath: Path,
  path: string,
  query?: QueryParams<Path, "get">
): Promise<PaginatedResult<ArrayItem<ContractResponseData<Path, "get">>>> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE}${withQuery(path, query as PrimitiveQuery | undefined)}`, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    }
  });

  if (res.status === 401) {
    clearStoredSession();
    emitUnauthorizedEvent();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const json = await res.json() as ResponseContent<Path, "get">;
  const meta = "meta" in json ? json.meta : undefined;
  const pagination = meta && typeof meta === "object" && meta !== null && "pagination" in meta
    ? (meta.pagination as PaginationMeta)
    : {
        page: Number((query as PrimitiveQuery | undefined)?.page ?? 1),
        pageSize: Number((query as PrimitiveQuery | undefined)?.pageSize ?? defaultPageSize),
        total: Array.isArray(json.data) ? json.data.length : 0,
        pageCount: 1
      };

  return {
    items: (json.data ?? []) as ArrayItem<ContractResponseData<Path, "get">>[],
    pagination
  };
}

async function requestAdminDelete(path: string, options?: { includeAuth?: boolean; handleUnauthorized?: boolean }) {
  const accessToken = options?.includeAuth === false ? null : getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
  });

  if (res.status === 401 && options?.handleUnauthorized !== false) {
    clearStoredSession();
    emitUnauthorizedEvent();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
}

async function requestRuntime<T>(path: string, payload: unknown, accessToken?: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const body = await res.text();
    const dataEvents = body
      .split(/\r?\n\r?\n/)
      .flatMap((chunk) =>
        chunk
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
      )
      .filter(Boolean);

    const lastEvent = dataEvents.at(-1);
    if (!lastEvent) {
      throw new Error("Runtime returned an empty event stream");
    }

    return JSON.parse(lastEvent) as T;
  }

  return res.json() as Promise<T>;
}

export const getMcpRuntimeUrl = (serverSlug: string) =>
  `${MCP_BASE.replace(/\/$/, "")}/mcp/${serverSlug}`;

async function listAllPages<Path extends AdminPath>(
  schemaPath: Path,
  path: string,
  baseQuery?: QueryParams<Path, "get">
): Promise<ArrayItem<ContractResponseData<Path, "get">>[]> {
  const firstPage = await requestAdminPaginated(schemaPath, path, {
    ...baseQuery,
    page: 1,
    pageSize: 100
  } as QueryParams<Path, "get">);

  if (firstPage.pagination.pageCount <= 1) {
    return firstPage.items;
  }

  const remaining = await Promise.all(
    Array.from({ length: firstPage.pagination.pageCount - 1 }, (_, index) =>
      requestAdminPaginated(schemaPath, path, {
        ...baseQuery,
        page: index + 2,
        pageSize: 100
      } as QueryParams<Path, "get">)
    )
  );

  return firstPage.items.concat(...remaining.map((page) => page.items));
}

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> =>
    requestAdmin(adminApiPaths.auth.login, adminApiPaths.auth.login, {
      method: "post",
      includeAuth: false,
      handleUnauthorized: false,
      body: { username, password }
    }),
  me: async (): Promise<MeResponse> =>
    requestAdmin(adminApiPaths.auth.me, adminApiPaths.auth.me, {
      method: "get"
    })
};

export const organizationsApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<Organization>> =>
    requestAdminPaginated(adminApiPaths.organizations.list, adminApiPaths.organizations.list, { page, pageSize, search }),
  listAll: async (): Promise<Organization[]> =>
    listAllPages(adminApiPaths.organizations.list, adminApiPaths.organizations.list)
};

export const securityApi = {
  getAuthServer: async (): Promise<AuthServerConfig | null> =>
    requestAdmin(adminApiPaths.security.authServer, adminApiPaths.security.authServer, {
      method: "get"
    }),
  saveAuthServer: async (data: AuthServerConfigFormData): Promise<AuthServerConfig> =>
    requestAdmin(adminApiPaths.security.authServer, adminApiPaths.security.authServer, {
      method: "put",
      body: data
    })
};

export const configApi = {
  validate: async (): Promise<ConfigValidationResult> =>
    requestAdmin("/config/validate/{organizationId}", adminApiPaths.config.validate(requireOrganizationId()), {
      method: "get"
    }),
  listSnapshots: async (): Promise<RuntimeSnapshot[]> =>
    requestAdmin("/config/snapshots/{organizationId}", adminApiPaths.config.snapshots(requireOrganizationId()), {
      method: "get"
    }),
  publish: async (notes?: string): Promise<PublishResult> =>
    requestAdmin(adminApiPaths.config.publish, adminApiPaths.config.publish, {
      method: "post",
      body: {
        organizationId: requireOrganizationId(),
        notes
      }
    })
};

export const openApiImportApi = {
  preview: async (payload: {
    name: string;
    slug: string;
    description?: string;
    defaultBaseUrl: string;
    specText: string;
    targetMcpServerId?: string;
  }): Promise<OpenApiImportPreview> =>
    requestAdmin(adminApiPaths.openApiImport.preview, adminApiPaths.openApiImport.preview, {
      method: "post",
      body: payload
    }),
  execute: async (payload: {
    name: string;
    slug: string;
    description?: string;
    defaultBaseUrl: string;
    specText: string;
    targetMcpServerId?: string;
    operations: Array<{
      operationKey: string;
      exposeAsTool: boolean;
    }>;
  }): Promise<OpenApiImportResult> =>
    requestAdmin(adminApiPaths.openApiImport.execute, adminApiPaths.openApiImport.execute, {
      method: "post",
      body: payload
    })
};

export const mcpRuntimeApi = {
  call: async <T>(serverSlug: string, payload: unknown, accessToken?: string): Promise<T> =>
    requestRuntime(getMcpRuntimeUrl(serverSlug), payload, accessToken)
};

export const backendApisApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<BackendApi>> =>
    requestAdminPaginated(adminApiPaths.backendApis.list, adminApiPaths.backendApis.list, {
      organizationId: requireOrganizationId(),
      page,
      pageSize,
      search
    }),
  listAll: async (): Promise<BackendApi[]> =>
    listAllPages(adminApiPaths.backendApis.list, adminApiPaths.backendApis.list, { organizationId: requireOrganizationId() }),
  get: async (id: string): Promise<BackendApi> => {
    const rows = await backendApisApi.listAll();
    const row = rows.find((item) => item.id === id);
    if (!row) {
      throw new Error(`Backend API ${id} not found`);
    }
    return row;
  },
  create: async (data: BackendApiFormData): Promise<BackendApi> =>
    requestAdmin(adminApiPaths.backendApis.list, adminApiPaths.backendApis.list, {
      method: "post",
      body: {
        ...normalizeBackendApiPayload(data),
        organizationId: requireOrganizationId()
      } as BackendApiFormData
    }),
  update: async (id: string, data: Partial<BackendApiFormData>): Promise<BackendApi> =>
    requestAdmin("/backend-apis/{id}", adminApiPaths.backendApis.byId(id), {
      method: "patch",
      body: normalizeBackendApiPayload(data) as Partial<BackendApiFormData>
    }),
  delete: async (id: string): Promise<void> =>
    requestAdminDelete(adminApiPaths.backendApis.byId(id))
};

export const resourcesApi = {
  list: async (backendApiId: string, page = 1, pageSize = defaultPageSize): Promise<PaginatedResult<BackendResource>> =>
    requestAdminPaginated(adminApiPaths.backendResources.list, adminApiPaths.backendResources.list, { backendApiId, page, pageSize }),
  listAll: async (backendApiId: string): Promise<BackendResource[]> =>
    listAllPages(adminApiPaths.backendResources.list, adminApiPaths.backendResources.list, { backendApiId }),
  create: async (data: BackendResourceFormData): Promise<BackendResource> =>
    requestAdmin(adminApiPaths.backendResources.list, adminApiPaths.backendResources.list, {
      method: "post",
      body: data
    }),
  update: async (id: string, data: Partial<BackendResourceFormData>): Promise<BackendResource> =>
    requestAdmin("/backend-resources/{id}", adminApiPaths.backendResources.byId(id), {
      method: "patch",
      body: data
    }),
  delete: async (id: string): Promise<void> =>
    requestAdminDelete(adminApiPaths.backendResources.byId(id))
};

export const scopesApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<Scope>> =>
    requestAdminPaginated(adminApiPaths.scopes.list, adminApiPaths.scopes.list, {
      organizationId: requireOrganizationId(),
      page,
      pageSize,
      search
    }),
  listAll: async (): Promise<Scope[]> =>
    listAllPages(adminApiPaths.scopes.list, adminApiPaths.scopes.list, { organizationId: requireOrganizationId() }),
  create: async (data: ScopeFormData): Promise<Scope> =>
    requestAdmin(adminApiPaths.scopes.list, adminApiPaths.scopes.list, {
      method: "post",
      body: {
        ...data,
        organizationId: requireOrganizationId()
      } as ScopeFormData
    }),
  update: async (id: string, data: Partial<ScopeFormData>): Promise<Scope> =>
    requestAdmin("/scopes/{id}", adminApiPaths.scopes.byId(id), {
      method: "patch",
      body: data
    }),
  delete: async (id: string): Promise<void> =>
    requestAdminDelete(adminApiPaths.scopes.byId(id))
};

export const toolMappingsApi = {
  list: async (page = 1, pageSize = defaultPageSize): Promise<PaginatedResult<ToolMapping>> =>
    requestAdminPaginated(adminApiPaths.toolMappings.list, adminApiPaths.toolMappings.list, { page, pageSize }),
  listAll: async (): Promise<ToolMapping[]> =>
    listAllPages(adminApiPaths.toolMappings.list, adminApiPaths.toolMappings.list),
  get: async (id: string): Promise<ToolMapping> => {
    const rows = await toolMappingsApi.listAll();
    const row = rows.find((item) => item.id === id);
    if (!row) {
      throw new Error(`Tool mapping ${id} not found`);
    }
    return row;
  },
  create: async (data: ToolMappingFormData): Promise<ToolMapping> =>
    requestAdmin(adminApiPaths.toolMappings.list, adminApiPaths.toolMappings.list, {
      method: "post",
      body: data
    }),
  update: async (id: string, data: Partial<ToolMappingFormData>): Promise<ToolMapping> =>
    requestAdmin("/tool-mappings/{id}", adminApiPaths.toolMappings.byId(id), {
      method: "patch",
      body: data
    })
};

export const mcpServersApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<McpServer>> =>
    requestAdminPaginated(adminApiPaths.mcpServers.list, adminApiPaths.mcpServers.list, {
      organizationId: requireOrganizationId(),
      page,
      pageSize,
      search
    }),
  listAll: async (): Promise<McpServer[]> =>
    listAllPages(adminApiPaths.mcpServers.list, adminApiPaths.mcpServers.list, { organizationId: requireOrganizationId() }),
  get: async (id: string): Promise<McpServer> => {
    const rows = await mcpServersApi.listAll();
    const row = rows.find((item) => item.id === id);
    if (!row) {
      throw new Error(`MCP server ${id} not found`);
    }
    return row;
  },
  create: async (data: McpServerFormData): Promise<McpServer> =>
    requestAdmin(adminApiPaths.mcpServers.list, adminApiPaths.mcpServers.list, {
      method: "post",
      body: {
        ...data,
        organizationId: requireOrganizationId()
      } as McpServerFormData
    }),
  update: async (id: string, data: Partial<McpServerFormData>): Promise<McpServer> =>
    requestAdmin("/mcp-servers/{id}", adminApiPaths.mcpServers.byId(id), {
      method: "patch",
      body: data
    }),
  delete: async (id: string): Promise<void> =>
    requestAdminDelete(adminApiPaths.mcpServers.byId(id))
};

export const toolsApi = {
  list: async (mcpServerId?: string, page = 1, pageSize = defaultPageSize): Promise<PaginatedResult<Tool>> =>
    requestAdminPaginated(adminApiPaths.tools.list, adminApiPaths.tools.list, { mcpServerId, page, pageSize }),
  listAll: async (mcpServerId?: string): Promise<Tool[]> =>
    listAllPages(adminApiPaths.tools.list, adminApiPaths.tools.list, { mcpServerId }),
  get: async (id: string): Promise<Tool> =>
    requestAdmin("/tools/{id}", adminApiPaths.tools.byId(id), {
      method: "get"
    }),
  create: async (data: ToolFormData): Promise<Tool> =>
    requestAdmin(adminApiPaths.tools.list, adminApiPaths.tools.list, {
      method: "post",
      body: data
    }),
  update: async (id: string, data: Partial<ToolFormData>): Promise<Tool> =>
    requestAdmin("/tools/{id}", adminApiPaths.tools.byId(id), {
      method: "patch",
      body: data
    }),
  delete: async (id: string): Promise<void> =>
    requestAdminDelete(adminApiPaths.tools.byId(id)),
  listByServer: async (serverId: string): Promise<Tool[]> =>
    toolsApi.listAll(serverId)
};
