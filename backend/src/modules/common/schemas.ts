import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const jsonSchema = z.record(z.string(), z.unknown()).or(z.array(z.unknown())).or(z.object({}).passthrough());

export const entityTimestampsSchema = z.object({
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
