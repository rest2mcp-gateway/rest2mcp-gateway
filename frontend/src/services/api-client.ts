import {
  clearStoredSession,
  emitUnauthorizedEvent,
  getStoredSession,
  type AuthUser
} from "@/lib/auth";
import type {
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
  ToolMappingFormData
} from "@/types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/admin/v1";
const MCP_BASE = import.meta.env.VITE_MCP_BASE_URL || window.location.origin;

type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

const getAccessToken = () => getStoredSession()?.accessToken ?? null;
const getOrganizationId = () => getStoredSession()?.user.organizationId ?? null;
const defaultPageSize = 10;

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

const withQuery = (path: string, query?: Record<string, string | number | boolean | undefined | null>) => {
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

async function request<T>(
  path: string,
  options?: RequestInit & { includeAuth?: boolean; handleUnauthorized?: boolean }
): Promise<T> {
  const accessToken = options?.includeAuth === false ? null : getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers
    },
    ...options
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

  if (res.status === 204) {
    return undefined as T;
  }

  const json = await res.json() as T | ApiEnvelope<T>;
  if (json && typeof json === "object" && "data" in json) {
    return (json as ApiEnvelope<T>).data;
  }
  return json as T;
}

async function requestPaginated<T>(path: string, query?: Record<string, string | number | boolean | undefined | null>): Promise<PaginatedResult<T>> {
  const accessToken = getAccessToken();
  const res = await fetch(`${API_BASE}${withQuery(path, query)}`, {
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

  const json = await res.json() as ApiEnvelope<T[]>;
  const meta = (json.meta ?? {}) as { pagination?: PaginationMeta };

  return {
    items: json.data ?? [],
    pagination: meta.pagination ?? {
      page: Number(query?.page ?? 1),
      pageSize: Number(query?.pageSize ?? defaultPageSize),
      total: Array.isArray(json.data) ? json.data.length : 0,
      pageCount: 1
    }
  };
}

async function requestRuntime<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export const getMcpRuntimeUrl = (organizationSlug: string, serverSlug: string) =>
  `${MCP_BASE.replace(/\/$/, "")}/mcp/${organizationSlug}/${serverSlug}`;

async function listAllPages<T>(path: string, baseQuery?: Record<string, string | number | boolean | undefined | null>): Promise<T[]> {
  const firstPage = await requestPaginated<T>(path, {
    ...baseQuery,
    page: 1,
    pageSize: 100
  });

  if (firstPage.pagination.pageCount <= 1) {
    return firstPage.items;
  }

  const remaining = await Promise.all(
    Array.from({ length: firstPage.pagination.pageCount - 1 }, (_, index) =>
      requestPaginated<T>(path, {
        ...baseQuery,
        page: index + 2,
        pageSize: 100
      })
    )
  );

  return firstPage.items.concat(...remaining.map((page) => page.items));
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> =>
    request("/auth/login", {
      method: "POST",
      includeAuth: false,
      handleUnauthorized: false,
      body: JSON.stringify({ email, password })
    }),
  me: async (): Promise<{ user: AuthUser }> =>
    request("/auth/me")
};

export const organizationsApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<Organization>> =>
    requestPaginated("/organizations", { page, pageSize, search }),
  listAll: async (): Promise<Organization[]> =>
    listAllPages("/organizations")
};

export const configApi = {
  validate: async (): Promise<ConfigValidationResult> =>
    request(`/config/validate/${getOrganizationId()}`),
  listSnapshots: async (): Promise<RuntimeSnapshot[]> =>
    request(`/config/snapshots/${getOrganizationId()}`),
  publish: async (notes?: string): Promise<PublishResult> =>
    request("/config/publish", {
      method: "POST",
      body: JSON.stringify({
        organizationId: getOrganizationId(),
        notes
      })
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
    request("/openapi-import/preview", {
      method: "POST",
      body: JSON.stringify(payload)
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
    request("/openapi-import/execute", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

export const mcpRuntimeApi = {
  call: async <T>(organizationSlug: string, serverSlug: string, payload: unknown): Promise<T> =>
    requestRuntime(getMcpRuntimeUrl(organizationSlug, serverSlug), payload)
};

export const backendApisApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<BackendApi>> =>
    requestPaginated("/backend-apis", { organizationId: getOrganizationId(), page, pageSize, search }),
  listAll: async (): Promise<BackendApi[]> =>
    listAllPages("/backend-apis", { organizationId: getOrganizationId() }),
  get: async (id: string): Promise<BackendApi> => {
    const rows = await backendApisApi.listAll();
    const row = rows.find((item) => item.id === id);
    if (!row) {
      throw new Error(`Backend API ${id} not found`);
    }
    return row;
  },
  create: async (data: BackendApiFormData): Promise<BackendApi> =>
    request("/backend-apis", {
      method: "POST",
      body: JSON.stringify({
        ...normalizeBackendApiPayload(data),
        organizationId: getOrganizationId()
      })
    }),
  update: async (id: string, data: Partial<BackendApiFormData>): Promise<BackendApi> =>
    request(`/backend-apis/${id}`, {
      method: "PATCH",
      body: JSON.stringify(normalizeBackendApiPayload(data))
    })
};

export const resourcesApi = {
  list: async (backendApiId: string, page = 1, pageSize = defaultPageSize): Promise<PaginatedResult<BackendResource>> =>
    requestPaginated("/backend-resources", { backendApiId, page, pageSize }),
  listAll: async (backendApiId: string): Promise<BackendResource[]> =>
    listAllPages("/backend-resources", { backendApiId }),
  create: async (data: BackendResourceFormData): Promise<BackendResource> =>
    request("/backend-resources", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  update: async (id: string, data: Partial<BackendResourceFormData>): Promise<BackendResource> =>
    request(`/backend-resources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    })
};

export const scopesApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<Scope>> =>
    requestPaginated("/scopes", { organizationId: getOrganizationId(), page, pageSize, search }),
  listAll: async (): Promise<Scope[]> =>
    listAllPages("/scopes", { organizationId: getOrganizationId() }),
  create: async (data: ScopeFormData): Promise<Scope> =>
    request("/scopes", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        organizationId: getOrganizationId()
      })
    }),
  update: async (id: string, data: Partial<ScopeFormData>): Promise<Scope> =>
    request(`/scopes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    })
};

export const toolMappingsApi = {
  list: async (page = 1, pageSize = defaultPageSize): Promise<PaginatedResult<ToolMapping>> =>
    requestPaginated("/tool-mappings", { page, pageSize }),
  listAll: async (): Promise<ToolMapping[]> =>
    listAllPages("/tool-mappings"),
  get: async (id: string): Promise<ToolMapping> => {
    const rows = await toolMappingsApi.listAll();
    const row = rows.find((item) => item.id === id);
    if (!row) {
      throw new Error(`Tool mapping ${id} not found`);
    }
    return row;
  },
  create: async (data: ToolMappingFormData): Promise<ToolMapping> =>
    request("/tool-mappings", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  update: async (id: string, data: Partial<ToolMappingFormData>): Promise<ToolMapping> =>
    request(`/tool-mappings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    })
};

export const mcpServersApi = {
  list: async (page = 1, pageSize = defaultPageSize, search?: string): Promise<PaginatedResult<McpServer>> =>
    requestPaginated("/mcp-servers", { organizationId: getOrganizationId(), page, pageSize, search }),
  listAll: async (): Promise<McpServer[]> =>
    listAllPages("/mcp-servers", { organizationId: getOrganizationId() }),
  get: async (id: string): Promise<McpServer> => {
    const rows = await mcpServersApi.listAll();
    const row = rows.find((item) => item.id === id);
    if (!row) {
      throw new Error(`MCP server ${id} not found`);
    }
    return row;
  },
  create: async (data: McpServerFormData): Promise<McpServer> =>
    request("/mcp-servers", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        organizationId: getOrganizationId()
      })
    }),
  update: async (id: string, data: Partial<McpServerFormData>): Promise<McpServer> =>
    request(`/mcp-servers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    })
};

export const toolsApi = {
  list: async (mcpServerId?: string, page = 1, pageSize = defaultPageSize): Promise<PaginatedResult<Tool>> =>
    requestPaginated("/tools", { mcpServerId, page, pageSize }),
  listAll: async (mcpServerId?: string): Promise<Tool[]> =>
    listAllPages("/tools", { mcpServerId }),
  get: async (id: string): Promise<Tool> => request(`/tools/${id}`),
  create: async (data: ToolFormData): Promise<Tool> =>
    request("/tools", {
      method: "POST",
      body: JSON.stringify(data)
    }),
  update: async (id: string, data: Partial<ToolFormData>): Promise<Tool> =>
    request(`/tools/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    }),
  listByServer: async (serverId: string): Promise<Tool[]> =>
    toolsApi.listAll(serverId)
};
