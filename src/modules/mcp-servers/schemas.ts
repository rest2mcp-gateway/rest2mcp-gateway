import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const mcpServerBodySchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  version: z.string().default("1.0.0"),
  title: z.string().min(1),
  description: z.string().optional(),
  authMode: z.enum(["local", "oidc"]).default("local"),
  isActive: z.boolean().default(true)
});

export const mcpServerUpdateSchema = mcpServerBodySchema.partial().omit({ organizationId: true });
export const mcpServerListQuerySchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional()
});
