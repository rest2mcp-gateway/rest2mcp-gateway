import { and, asc, count, eq, ilike } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { backendApis, backendResources } from "../../db/schema.js";

type ListQuery = {
  backendApiId?: string | undefined;
  page: number;
  pageSize: number;
  search?: string | undefined;
};

export const backendResourceRepository = {
  async list(app: FastifyInstance, organizationId: string, query: ListQuery) {
    const conditions = [eq(backendApis.organizationId, organizationId)];

    if (query.backendApiId) {
      conditions.push(eq(backendResources.backendApiId, query.backendApiId));
    }

    if (query.search) {
      conditions.push(ilike(backendResources.name, `%${query.search}%`));
    }

    const where = and(...conditions);

    const rows = await app.db
      .select({ resource: backendResources })
      .from(backendResources)
      .innerJoin(backendApis, eq(backendResources.backendApiId, backendApis.id))
      .where(where)
      .orderBy(asc(backendResources.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await app.db
      .select({ total: count() })
      .from(backendResources)
      .innerJoin(backendApis, eq(backendResources.backendApiId, backendApis.id))
      .where(where);

    return {
      rows: rows.map((row) => row.resource),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totalRow?.total ?? 0,
        pageCount: Math.ceil((totalRow?.total ?? 0) / query.pageSize)
      }
    };
  },

  async getById(app: FastifyInstance, organizationId: string, resourceId: string) {
    const [row] = await app.db
      .select({ resource: backendResources })
      .from(backendResources)
      .innerJoin(backendApis, eq(backendResources.backendApiId, backendApis.id))
      .where(and(eq(backendResources.id, resourceId), eq(backendApis.organizationId, organizationId)))
      .limit(1);

    return row?.resource ?? null;
  },

  async create(app: FastifyInstance, values: typeof backendResources.$inferInsert) {
    const [row] = await app.db.insert(backendResources).values(values).returning();
    return row ?? null;
  },

  async update(app: FastifyInstance, resourceId: string, values: Partial<typeof backendResources.$inferInsert>) {
    const [row] = await app.db
      .update(backendResources)
      .set(values)
      .where(eq(backendResources.id, resourceId))
      .returning();

    return row ?? null;
  }
};
