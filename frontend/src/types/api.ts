export type AuthType = "none" | "api_key" | "bearer" | "basic" | "oauth2";
export type ApiKeyPlacement = "header" | "query";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type RiskLevel = "low" | "medium" | "high" | "critical" | string;
export type ServerAuthMode = "local" | "oidc";
export type McpAccessMode = "public" | "protected";

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface RetryPolicy {
  retries?: number;
  maxRetries?: number;
  backoffMs?: number;
  retryOn?: number[];
  [key: string]: unknown;
}

export interface BackendApi {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string | null;
  defaultBaseUrl: string;
  authType: AuthType;
  authConfig: Record<string, unknown>;
  apiKeyLocation?: ApiKeyPlacement | null;
  apiKeyName?: string | null;
  apiKeyValue?: string | null;
  hasApiKeyValue?: boolean;
  apiKeyMaskedValue?: string | null;
  bearerToken?: string | null;
  hasBearerToken?: boolean;
  basicUsername?: string | null;
  basicPassword?: string | null;
  hasBasicPassword?: boolean;
  oauth2AccessToken?: string | null;
  hasOauth2AccessToken?: boolean;
  defaultTimeoutMs: number;
  retryPolicy: RetryPolicy | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackendResource {
  id: string;
  backendApiId: string;
  name: string;
  operationId: string;
  description?: string | null;
  httpMethod: HttpMethod;
  pathTemplate: string;
  bodyTemplate?: string | null;
  requestSchema: Record<string, unknown> | null;
  responseSchema: Record<string, unknown> | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface McpServer {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  version: string;
  title: string;
  description?: string | null;
  authMode: ServerAuthMode;
  accessMode: McpAccessMode;
  audience?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthServerConfig {
  id?: string;
  organizationId?: string;
  issuer: string;
  jwksUri: string;
  authorizationServerMetadataUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ToolMappingConfig {
  id?: string;
  backendApiId: string;
  backendResourceId: string;
  requestMapping: Record<string, unknown>;
  responseMapping: Record<string, unknown>;
  errorMapping: Record<string, unknown>;
  authStrategy: string;
  timeoutOverrideMs: number | null;
  retryOverride: RetryPolicy | null;
  isActive: boolean;
}

export interface Tool {
  id: string;
  mcpServerId: string;
  name: string;
  slug: string;
  title: string;
  description?: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  examples: unknown[] | null;
  riskLevel: RiskLevel;
  scopeIds: string[];
  mapping: ToolMappingConfig | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Scope {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  isSensitive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ToolMapping {
  id: string;
  toolId: string;
  backendApiId: string;
  backendResourceId: string;
  requestMapping: Record<string, unknown> | null;
  responseMapping: Record<string, unknown> | null;
  errorMapping: Record<string, unknown> | null;
  authStrategy: string;
  timeoutOverrideMs: number | null;
  retryOverride: RetryPolicy | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  issues: string[];
}

export interface RuntimeSnapshot {
  id: string;
  organizationId: string;
  version: number;
  status: "draft" | "published" | "archived" | string;
  snapshotJson: Record<string, unknown>;
  createdBy?: string | null;
  createdAt: string;
  publishedAt?: string | null;
}

export interface PublishResult {
  published: boolean;
  issues: string[];
  snapshot?: RuntimeSnapshot;
}

export interface OpenApiImportOperationPreview {
  operationKey: string;
  operationId: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  exposable: boolean;
  exposureIssues: string[];
  suggestedToolName: string;
  suggestedToolSlug: string;
  suggestedToolTitle: string;
}

export interface OpenApiImportPreview {
  backendApi: {
    name: string;
    slug: string;
    description: string;
  };
  operations: OpenApiImportOperationPreview[];
}

export interface OpenApiImportResult {
  backendApi: BackendApi;
  importedResourceCount: number;
  importedToolCount: number;
  operations: Array<{
    operationKey: string;
    importedAsTool: boolean;
  }>;
}

export type BackendApiFormData = Omit<BackendApi, "id" | "organizationId" | "createdAt" | "updatedAt">;
export type BackendResourceFormData = Omit<BackendResource, "id" | "createdAt" | "updatedAt">;
export type McpServerFormData = Omit<McpServer, "id" | "organizationId" | "createdAt" | "updatedAt">;
export type AuthServerConfigFormData = Omit<AuthServerConfig, "id" | "organizationId" | "createdAt" | "updatedAt">;
export type ScopeFormData = Omit<Scope, "id" | "organizationId" | "createdAt" | "updatedAt">;
export type ToolMappingFormData = Omit<ToolMapping, "id" | "createdAt" | "updatedAt">;
export type ToolFormData = Omit<Tool, "id" | "createdAt" | "updatedAt" | "mapping"> & {
  mapping: Omit<ToolMappingConfig, "id" | "backendApiId"> | null;
};
