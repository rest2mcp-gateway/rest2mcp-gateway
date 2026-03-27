import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const toolMappingBodySchema = z.object({
  toolId: z.string().uuid(),
  backendApiId: z.string().uuid().optional(),
  backendResourceId: z.string().uuid(),
  requestMapping: z.record(z.string(), z.unknown()).default({}),
  responseMapping: z.record(z.string(), z.unknown()).default({}),
  errorMapping: z.record(z.string(), z.unknown()).default({}),
  authStrategy: z.string().default("inherit"),
  timeoutOverrideMs: z.number().int().positive().nullable().optional(),
  retryOverride: z.record(z.string(), z.unknown()).nullable().optional(),
  isActive: z.boolean().default(true)
});

export const toolMappingUpdateSchema = toolMappingBodySchema.partial();
export const toolMappingListQuerySchema = paginationSchema.extend({
  toolId: z.string().uuid().optional()
});
