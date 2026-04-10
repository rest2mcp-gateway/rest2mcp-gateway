import { z } from "zod";
import { authUserSchema, envConfigSchema } from "../modules/auth/schemas.js";

export { authUserSchema, envConfigSchema };

const timestampSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string().datetime()
);
const uuidSchema = z.string().uuid();
const jsonObjectSchema = z.record(z.string(), z.unknown());
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative()
});

export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(data: T, meta?: z.ZodTypeAny) =>
  z.object({
    data,
    ...(meta ? { meta } : {})
  });

export const paginatedMetaSchema = z.object({
  pagination: paginationMetaSchema
});

export const organizationSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const backendApiSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  defaultBaseUrl: z.string().url(),
  authType: z.enum(["none", "api_key", "bearer", "basic", "oauth2"]),
  authConfig: jsonObjectSchema,
  apiKeyLocation: z.enum(["header", "query"]).nullable().optional(),
  apiKeyName: z.string().nullable().optional(),
  apiKeyValue: z.string().nullable().optional(),
  hasApiKeyValue: z.boolean().optional(),
  apiKeyMaskedValue: z.string().nullable().optional(),
  tokenExchangeEnabled: z.boolean(),
  tokenExchangeAudience: z.string().nullable().optional(),
  bearerToken: z.string().nullable().optional(),
  hasBearerToken: z.boolean().optional(),
  basicUsername: z.string().nullable().optional(),
  basicPassword: z.string().nullable().optional(),
  hasBasicPassword: z.boolean().optional(),
  oauth2AccessToken: z.string().nullable().optional(),
  hasOauth2AccessToken: z.boolean().optional(),
  defaultTimeoutMs: z.number().int().positive(),
  retryPolicy: jsonObjectSchema.nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const backendResourceSchema = z.object({
  id: uuidSchema,
  backendApiId: uuidSchema,
  name: z.string().min(1),
  operationId: z.string().min(1),
  description: z.string().nullable().optional(),
  httpMethod: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  pathTemplate: z.string().min(1),
  bodyTemplate: z.string().nullable().optional(),
  requestSchema: jsonObjectSchema.nullable(),
  responseSchema: jsonObjectSchema.nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const mcpServerSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  authMode: z.enum(["local", "oidc"]),
  accessMode: z.enum(["public", "protected"]),
  audience: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const authServerConfigSchema = z.object({
  id: uuidSchema.optional(),
  organizationId: uuidSchema.optional(),
  issuer: z.string().url(),
  jwksUri: z.string().url(),
  tokenEndpoint: z.string().url().nullable().optional(),
  clientId: z.string().nullable().optional(),
  clientSecret: z.string().nullable().optional(),
  hasClientSecret: z.boolean().optional(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const toolMappingConfigSchema = z.object({
  id: uuidSchema.optional(),
  backendApiId: uuidSchema,
  backendResourceId: uuidSchema,
  requestMapping: jsonObjectSchema,
  responseMapping: jsonObjectSchema,
  errorMapping: jsonObjectSchema,
  authStrategy: z.string(),
  timeoutOverrideMs: z.number().int().positive().nullable(),
  retryOverride: jsonObjectSchema.nullable(),
  isActive: z.boolean()
});

export const toolSchema = z.object({
  id: uuidSchema,
  mcpServerId: uuidSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  inputSchema: jsonObjectSchema.nullable(),
  outputSchema: jsonObjectSchema.nullable(),
  examples: z.array(jsonValueSchema).nullable(),
  riskLevel: z.string(),
  scopeIds: z.array(uuidSchema),
  mapping: toolMappingConfigSchema.nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const scopeSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  isSensitive: z.boolean(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const secretSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  secretType: z.enum(["api_key", "token", "password", "certificate", "other"]),
  storageMode: z.enum(["database", "external_ref"]),
  externalRef: z.string().nullable().optional(),
  keyVersion: z.number().int().positive(),
  metadata: jsonObjectSchema,
  hasValue: z.boolean(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const toolMappingSchema = z.object({
  id: uuidSchema,
  toolId: uuidSchema,
  backendApiId: uuidSchema,
  backendResourceId: uuidSchema,
  requestMapping: jsonObjectSchema.nullable(),
  responseMapping: jsonObjectSchema.nullable(),
  errorMapping: jsonObjectSchema.nullable(),
  authStrategy: z.string(),
  timeoutOverrideMs: z.number().int().positive().nullable(),
  retryOverride: jsonObjectSchema.nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});

export const configValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.string())
});

export const runtimeSnapshotSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  version: z.number().int(),
  status: z.string(),
  snapshotJson: jsonObjectSchema,
  createdBy: z.string().nullable().optional(),
  createdAt: timestampSchema,
  publishedAt: timestampSchema.nullable().optional()
});

export const auditEventSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  actorType: z.string().min(1),
  actorId: uuidSchema.nullable().optional(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: uuidSchema.nullable().optional(),
  payload: jsonObjectSchema,
  createdAt: timestampSchema
});

export const executionLogSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  mcpServerId: uuidSchema.nullable().optional(),
  toolId: uuidSchema.nullable().optional(),
  requestId: z.string().min(1),
  traceId: z.string().nullable().optional(),
  status: z.string().min(1),
  backendStatus: z.number().int().nullable().optional(),
  latencyMs: z.number().int().nullable().optional(),
  inputPayload: jsonValueSchema.nullable().optional(),
  outputPayload: jsonValueSchema.nullable().optional(),
  errorPayload: jsonValueSchema.nullable().optional(),
  createdAt: timestampSchema
});

export const publishResultSchema = z.object({
  published: z.boolean(),
  issues: z.array(z.string()),
  snapshot: runtimeSnapshotSchema.optional()
});

export const openApiImportOperationPreviewSchema = z.object({
  operationKey: z.string().min(1),
  operationId: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1),
  summary: z.string(),
  description: z.string(),
  inputSchema: jsonObjectSchema,
  responseSchema: jsonObjectSchema,
  pathTemplate: z.string().min(1),
  bodyTemplate: z.string().nullable(),
  requestSchema: jsonObjectSchema,
  exposable: z.boolean(),
  exposureIssues: z.array(z.string()),
  suggestedToolName: z.string(),
  suggestedToolSlug: z.string(),
  suggestedToolTitle: z.string()
});

export const openApiImportPreviewResultSchema = z.object({
  backendApi: z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    description: z.string()
  }),
  operations: z.array(openApiImportOperationPreviewSchema)
});

export const openApiImportExecuteResultSchema = z.object({
  backendApi: backendApiSchema,
  importedResourceCount: z.number().int().nonnegative(),
  importedToolCount: z.number().int().nonnegative(),
  operations: z.array(
    z.object({
      operationKey: z.string().min(1),
      importedAsTool: z.boolean()
    })
  )
});

export const authSessionSchema = z.object({
  token: z.string().min(1),
  user: authUserSchema,
  env_config: envConfigSchema
});

export const authMeSchema = z.object({
  user: authUserSchema,
  env_config: envConfigSchema
});
