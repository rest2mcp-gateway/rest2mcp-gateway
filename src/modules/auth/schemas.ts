import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["super_admin", "admin", "editor", "viewer"]),
  authMode: z.enum(["local", "oidc"]),
  isActive: z.boolean()
});
