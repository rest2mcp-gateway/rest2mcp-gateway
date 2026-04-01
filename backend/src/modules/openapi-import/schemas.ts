import { z } from "zod";

const openApiImportBaseSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  defaultBaseUrl: z.string().url(),
  specText: z.string().min(1),
  targetMcpServerId: z.string().uuid().optional()
});

export const openApiImportPreviewSchema = openApiImportBaseSchema;

export const openApiImportExecuteSchema = openApiImportBaseSchema.extend({
  operations: z.array(
    z.object({
      operationKey: z.string().min(1),
      exposeAsTool: z.boolean().default(false)
    })
  ).default([])
});
