import { z } from "zod";

export const authServerConfigSchema = z.object({
  issuer: z.string().url(),
  jwksUri: z.string().url(),
  tokenEndpoint: z.string().url().optional(),
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional()
});

export const authServerConfigResponseSchema = authServerConfigSchema.extend({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  tokenEndpoint: z.string().url().nullable().optional(),
  clientId: z.string().nullable().optional(),
  clientSecret: z.null().optional(),
  hasClientSecret: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
