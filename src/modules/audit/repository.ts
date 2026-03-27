import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { auditEvents } from "../../db/schema.js";

export const auditRepository = {
  listByOrganization: (app: FastifyInstance, organizationId: string) =>
    app.db.select().from(auditEvents).where(eq(auditEvents.organizationId, organizationId)).orderBy(desc(auditEvents.createdAt)).limit(100)
};
