import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const backendResourceBodySchema = z.object({
  backendApiId: z.string().uuid(),
  name: z.string().min(1),
  operationId: z.string().min(1),
  description: z.string().optional(),
  httpMethod: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  pathTemplate: z.string().min(1),
  bodyTemplate: z.string().optional(),
  requestSchema: z.record(z.string(), z.unknown()).default({}),
  responseSchema: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true)
});

export const backendResourceUpdateSchema = backendResourceBodySchema.partial().omit({ backendApiId: true });
export const backendResourceListQuerySchema = paginationSchema.extend({
  backendApiId: z.string().uuid().optional()
});
