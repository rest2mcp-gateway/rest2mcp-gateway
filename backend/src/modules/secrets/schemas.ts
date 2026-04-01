import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

const applySecretValidation = (
  value: {
    storageMode?: "database" | "external_ref" | undefined;
    externalRef?: string | undefined;
    plaintextValue?: string | undefined;
  },
  ctx: z.RefinementCtx
) => {
  if (value.storageMode === "database" && !value.plaintextValue) {
    ctx.addIssue({ code: "custom", message: "plaintextValue is required for database-backed secrets" });
  }
  if (value.storageMode === "external_ref" && !value.externalRef) {
    ctx.addIssue({ code: "custom", message: "externalRef is required for external_ref secrets" });
  }
};

const secretBodyBaseSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  secretType: z.enum(["api_key", "token", "password", "certificate", "other"]).default("other"),
  storageMode: z.enum(["database", "external_ref"]),
  externalRef: z.string().optional(),
  plaintextValue: z.string().optional(),
  keyVersion: z.number().int().positive().default(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const secretBodySchema = secretBodyBaseSchema.superRefine(applySecretValidation);

export const secretUpdateSchema = secretBodyBaseSchema
  .omit({ organizationId: true })
  .partial()
  .superRefine(applySecretValidation);
export const secretListQuerySchema = paginationSchema.extend({
  organizationId: z.string().uuid().optional()
});
