import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

const mcpServerBaseSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  version: z.string().default("1.0.0"),
  description: z.string().optional(),
  authMode: z.enum(["local", "oidc"]).default("local"),
  accessMode: z.enum(["public", "protected"]).default("public"),
  audience: z.string().optional(),
  isActive: z.boolean().default(true)
});

export const mcpServerBodySchema = mcpServerBaseSchema.superRefine((value, ctx) => {
  if (value.accessMode === "protected" && !value.audience) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["audience"],
      message: "Audience is required for protected MCP servers"
    });
  }
});

export const mcpServerUpdateSchema = mcpServerBaseSchema.partial().omit({ organizationId: true });
export const mcpServerListQuerySchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional()
});
