import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { mcpServers } from "../../db/schema.js";
import { buildCatalogRepository } from "../catalog/factory.js";

const baseRepository = buildCatalogRepository(mcpServers, "name");

export const mcpServerRepository = {
  ...baseRepository,
  getById: (app: FastifyInstance, organizationId: string, id: string) =>
    app.db.query.mcpServers.findFirst({
      where: and(eq(mcpServers.organizationId, organizationId), eq(mcpServers.id, id))
    })
};
