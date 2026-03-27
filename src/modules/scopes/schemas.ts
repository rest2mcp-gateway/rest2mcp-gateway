import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const scopeBodySchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  isSensitive: z.boolean().default(false)
});

export const scopeUpdateSchema = scopeBodySchema.partial().omit({ organizationId: true });
export const scopeListQuerySchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional()
});
