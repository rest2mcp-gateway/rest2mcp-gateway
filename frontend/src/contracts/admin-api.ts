import type { paths } from "@/generated/admin-api";

export type AdminPath = keyof paths;
type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
export type AdminMethod<Path extends AdminPath> = Extract<keyof paths[Path], HttpMethod>;

export type Operation<Path extends AdminPath, Method extends AdminMethod<Path>> = NonNullable<paths[Path][Method]>;

export type ResponseContent<Path extends AdminPath, Method extends AdminMethod<Path>> =
  Operation<Path, Method> extends { responses: { 200: { content: { "application/json": infer Body } } } }
    ? Body
    : never;

export type ResponseData<Path extends AdminPath, Method extends AdminMethod<Path>> =
  ResponseContent<Path, Method> extends { data: infer Data }
    ? Data
    : never;

export type ResponseMeta<Path extends AdminPath, Method extends AdminMethod<Path>> =
  ResponseContent<Path, Method> extends infer Body
    ? Body extends { meta: infer Meta }
      ? Meta
      : never
    : never;

export type RequestBody<Path extends AdminPath, Method extends AdminMethod<Path>> =
  Operation<Path, Method> extends { requestBody: { content: { "application/json": infer Body } } }
    ? Body
    : never;

export type QueryParams<Path extends AdminPath, Method extends AdminMethod<Path>> =
  Operation<Path, Method> extends { parameters: { query?: infer Query } }
    ? Query
    : never;

export type PathParams<Path extends AdminPath, Method extends AdminMethod<Path>> =
  Operation<Path, Method> extends { parameters: { path?: infer Params } }
    ? Params
    : never;

export const adminApiPaths = {
  auth: {
    login: "/auth/login" as const,
    me: "/auth/me" as const
  },
  organizations: {
    list: "/organizations/" as const
  },
  security: {
    authServer: "/security/auth-server" as const
  },
  config: {
    validate: (organizationId: string) => `/config/validate/${organizationId}`,
    snapshots: (organizationId: string) => `/config/snapshots/${organizationId}`,
    publish: "/config/publish" as const
  },
  openApiImport: {
    preview: "/openapi-import/preview" as const,
    execute: "/openapi-import/execute" as const
  },
  backendApis: {
    list: "/backend-apis/" as const,
    byId: (id: string) => `/backend-apis/${id}`
  },
  backendResources: {
    list: "/backend-resources/" as const,
    byId: (id: string) => `/backend-resources/${id}`
  },
  scopes: {
    list: "/scopes/" as const,
    byId: (id: string) => `/scopes/${id}`
  },
  toolMappings: {
    list: "/tool-mappings/" as const,
    byId: (id: string) => `/tool-mappings/${id}`
  },
  mcpServers: {
    list: "/mcp-servers/" as const,
    byId: (id: string) => `/mcp-servers/${id}`
  },
  tools: {
    list: "/tools/" as const,
    byId: (id: string) => `/tools/${id}`
  }
} as const;

export type Organization = ResponseData<"/organizations/", "get">[number];
export type BackendApi = ResponseData<"/backend-apis/", "get">[number];
export type BackendResource = ResponseData<"/backend-resources/", "get">[number];
export type McpServer = ResponseData<"/mcp-servers/", "get">[number];
export type Tool = ResponseData<"/tools/", "get">[number];
export type Scope = ResponseData<"/scopes/", "get">[number];
export type ToolMapping = ResponseData<"/tool-mappings/", "get">[number];
export type AuthServerConfig = Exclude<ResponseData<"/security/auth-server", "get">, null>;
export type ConfigValidationResult = ResponseData<"/config/validate/{organizationId}", "get">;
export type RuntimeSnapshot = ResponseData<"/config/snapshots/{organizationId}", "get">[number];
export type PublishResult = ResponseData<"/config/publish", "post">;
export type OpenApiImportPreview = ResponseData<"/openapi-import/preview", "post">;
export type OpenApiImportResult = ResponseData<"/openapi-import/execute", "post">;

export type PaginationMeta = ResponseMeta<"/organizations/", "get">["pagination"];
export type PaginatedResult<T> = {
  items: T[];
  pagination: PaginationMeta;
};

export type AuthType = BackendApi["authType"];
export type ApiKeyPlacement = NonNullable<BackendApi["apiKeyLocation"]>;
export type HttpMethod = BackendResource["httpMethod"];
export type RiskLevel = Tool["riskLevel"];
export type ServerAuthMode = McpServer["authMode"];
export type McpAccessMode = McpServer["accessMode"];
export type RetryPolicy = NonNullable<BackendApi["retryPolicy"]>;
export type ToolMappingConfig = NonNullable<Tool["mapping"]>;

export type BackendApiFormData = RequestBody<"/backend-apis/", "post">;
export type BackendResourceFormData = RequestBody<"/backend-resources/", "post">;
export type McpServerFormData = RequestBody<"/mcp-servers/", "post">;
export type AuthServerConfigFormData = RequestBody<"/security/auth-server", "put">;
export type ScopeFormData = RequestBody<"/scopes/", "post">;
export type ToolMappingFormData = RequestBody<"/tool-mappings/", "post">;
export type ToolFormData = RequestBody<"/tools/", "post">;
