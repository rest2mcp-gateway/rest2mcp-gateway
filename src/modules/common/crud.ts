import { and, asc, count, eq, ilike } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { toOffset } from "../../lib/pagination.js";

type ListOptions = {
  organizationId?: string;
  page: number;
  pageSize: number;
  search?: string;
  searchColumn?: string;
  isActive?: boolean;
};

export const listEntities = async (
  app: FastifyInstance,
  table: AnyPgTable,
  options: ListOptions
) => {
  const conditions = [];
  if (options.organizationId && "organizationId" in table) {
    conditions.push(eq((table as Record<string, any>).organizationId, options.organizationId));
  }
  if (typeof options.isActive === "boolean" && "isActive" in table) {
    conditions.push(eq((table as Record<string, any>).isActive, options.isActive));
  }
  if (options.search && options.searchColumn && options.searchColumn in table) {
    conditions.push(ilike((table as Record<string, any>)[options.searchColumn], `%${options.search}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await app.db.select().from(table).where(where).limit(options.pageSize).offset(toOffset(options.page, options.pageSize)).orderBy(asc((table as Record<string, any>).createdAt));
  const [{ total }] = await app.db.select({ total: count() }).from(table).where(where);

  return {
    rows,
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      pageCount: Math.ceil(total / options.pageSize)
    }
  };
};
