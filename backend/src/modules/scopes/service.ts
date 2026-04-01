import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { mcpServers, toolScopes, tools } from "../../db/schema.js";
import { buildCatalogService } from "../catalog/factory.js";
import { scopeRepository } from "./repository.js";

const listScopeDependencies = async (app: FastifyInstance, scopeId: string) =>
  app.db
    .select({
      toolId: tools.id,
      toolName: tools.name,
      serverId: mcpServers.id,
      serverName: mcpServers.name
    })
    .from(toolScopes)
    .innerJoin(tools, eq(toolScopes.toolId, tools.id))
    .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
    .where(eq(toolScopes.scopeId, scopeId));

const ensureScopeNotInUse = async (app: FastifyInstance, _organizationId: string, scopeId: string) => {
  const references = await listScopeDependencies(app, scopeId);
  if (references.length === 0) {
    return;
  }

  const preview = references
    .slice(0, 3)
    .map((reference) => `${reference.toolName} (${reference.serverName})`)
    .join(", ");
  const suffix = references.length > 3 ? `, and ${references.length - 3} more` : "";

  throw new AppError(
    409,
    `Cannot delete scope because it is assigned to ${references.length} tool${references.length === 1 ? "" : "s"}: ${preview}${suffix}.`,
    "scope_in_use",
    { references }
  );
};

export const scopeService = buildCatalogService("scope", scopeRepository, {
  autoPublish: true,
  beforeDelete: ensureScopeNotInUse
});
