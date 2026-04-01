import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const organizationCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1)
});

export const organizationUpdateSchema = organizationCreateSchema.partial();
export const organizationListQuerySchema = paginationSchema;
