import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { executionLogs } from "../../db/schema.js";

export const executionLogRepository = {
  listByOrganization: (app: FastifyInstance, organizationId: string) =>
    app.db.select().from(executionLogs).where(eq(executionLogs.organizationId, organizationId)).orderBy(desc(executionLogs.createdAt)).limit(100)
};
