import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { backendApis } from "../../db/schema.js";
import { buildCatalogRepository } from "../catalog/factory.js";

const baseRepository = buildCatalogRepository(backendApis, "name");

export const backendApiRepository = {
  ...baseRepository,
  getById: (app: FastifyInstance, organizationId: string, id: string) =>
    app.db.query.backendApis.findFirst({
      where: and(eq(backendApis.organizationId, organizationId), eq(backendApis.id, id))
    })
};
