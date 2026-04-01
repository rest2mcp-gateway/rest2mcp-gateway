import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const toolMappingConfigSchema = z.object({
  backendResourceId: z.string().uuid(),
  requestMapping: z.record(z.string(), z.unknown()).default({}),
  responseMapping: z.record(z.string(), z.unknown()).default({}),
  errorMapping: z.record(z.string(), z.unknown()).default({}),
  authStrategy: z.string().default("inherit"),
  timeoutOverrideMs: z.number().int().positive().nullable().optional(),
  retryOverride: z.record(z.string(), z.unknown()).nullable().optional(),
  isActive: z.boolean().default(true)
});

export const toolBodySchema = z.object({
  mcpServerId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  examples: z.array(z.unknown()).default([]),
  riskLevel: z.string().default("low"),
  isActive: z.boolean().default(true),
  scopeIds: z.array(z.string().uuid()).default([]),
  mapping: toolMappingConfigSchema.nullable().optional()
});

export const toolUpdateSchema = toolBodySchema.partial().omit({ mcpServerId: true });
export const toolListQuerySchema = paginationSchema.extend({
  mcpServerId: z.string().uuid().optional()
});
