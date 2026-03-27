import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const userCreateSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["super_admin", "admin", "editor", "viewer"]),
  authMode: z.enum(["local", "oidc"]),
  password: z.string().min(8).optional(),
  isActive: z.boolean().default(true)
});

export const userUpdateSchema = userCreateSchema.partial().omit({ organizationId: true });
export const userListQuerySchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional()
});
