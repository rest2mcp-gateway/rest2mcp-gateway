import { z } from "zod";

export const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  username: z.string().min(1),
  name: z.string(),
  role: z.enum(["super_admin", "admin", "editor", "viewer"]),
  authMode: z.enum(["local", "oidc"]),
  isActive: z.boolean()
});

export const envConfigSchema = z.object({
  autoPublishDrafts: z.boolean(),
  mode: z.enum(["development", "test", "production"])
});
