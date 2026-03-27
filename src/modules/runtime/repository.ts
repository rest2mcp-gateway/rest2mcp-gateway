import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  executionLogs,
  organizations,
  runtimeSnapshots
} from "../../db/schema.js";

export const runtimeRepository = {
  async getOrganizationBySlug(app: FastifyInstance, slug: string) {
    const [row] = await app.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    return row ?? null;
  },

  async getLatestPublishedSnapshotMeta(app: FastifyInstance, organizationId: string) {
    const [row] = await app.db
      .select({
        id: runtimeSnapshots.id,
        version: runtimeSnapshots.version,
        publishedAt: runtimeSnapshots.publishedAt
      })
      .from(runtimeSnapshots)
      .where(and(
        eq(runtimeSnapshots.organizationId, organizationId),
        eq(runtimeSnapshots.status, "published")
      ))
      .orderBy(desc(runtimeSnapshots.version))
      .limit(1);

    return row ?? null;
  },

  async getLatestPublishedSnapshot(app: FastifyInstance, organizationId: string) {
    const [row] = await app.db
      .select()
      .from(runtimeSnapshots)
      .where(and(
        eq(runtimeSnapshots.organizationId, organizationId),
        eq(runtimeSnapshots.status, "published")
      ))
      .orderBy(desc(runtimeSnapshots.version))
      .limit(1);

    return row ?? null;
  },

  async insertExecutionLog(
    app: FastifyInstance,
    values: typeof executionLogs.$inferInsert
  ) {
    const [row] = await app.db.insert(executionLogs).values(values).returning();
    return row;
  }
};
