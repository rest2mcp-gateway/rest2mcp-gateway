import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

const authTypeSchema = z.enum(["none", "api_key", "basic", "bearer", "oauth2"]);

const backendApiBaseSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  defaultBaseUrl: z.string().url(),
  authType: authTypeSchema.default("none"),
  authConfig: z.record(z.string(), z.unknown()).optional(),
  apiKeyLocation: z.enum(["header", "query"]).optional(),
  apiKeyName: z.string().min(1).optional(),
  apiKeyValue: z.string().min(1).optional(),
  bearerToken: z.string().min(1).optional(),
  basicUsername: z.string().min(1).optional(),
  basicPassword: z.string().min(1).optional(),
  oauth2AccessToken: z.string().min(1).optional(),
  defaultTimeoutMs: z.number().int().positive().default(30000),
  retryPolicy: z.record(z.string(), z.unknown()).default({ retries: 0 }),
  isActive: z.boolean().default(true)
});

export const backendApiBodySchema = backendApiBaseSchema.superRefine((value, ctx) => {
  if (value.authType === "api_key") {
    if (!value.apiKeyLocation) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["apiKeyLocation"], message: "API key location is required" });
    }
    if (!value.apiKeyName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["apiKeyName"], message: "API key name is required" });
    }
    if (!value.apiKeyValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["apiKeyValue"], message: "API key value is required" });
    }
  }

  if (value.authType === "bearer" && !value.bearerToken) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bearerToken"], message: "Bearer token is required" });
  }

  if (value.authType === "oauth2" && !value.oauth2AccessToken) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["oauth2AccessToken"], message: "OAuth 2.0 access token is required" });
  }

  if (value.authType === "basic") {
    if (!value.basicUsername) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["basicUsername"], message: "Basic auth username is required" });
    }
    if (!value.basicPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["basicPassword"], message: "Basic auth password is required" });
    }
  }
});

export const backendApiUpdateSchema = backendApiBaseSchema.partial().omit({ organizationId: true });
export const backendApiListQuerySchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional()
});
