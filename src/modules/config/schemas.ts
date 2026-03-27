import { z } from "zod";

export const publishBodySchema = z.object({
  organizationId: z.string().uuid(),
  notes: z.string().optional()
});
