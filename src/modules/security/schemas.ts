import { z } from "zod";

export const authServerConfigSchema = z.object({
  issuer: z.string().url(),
  jwksUri: z.string().url(),
  authorizationServerMetadataUrl: z.string().url().optional()
});

export const authServerConfigResponseSchema = authServerConfigSchema.extend({
  id: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});
