import { desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  authServerConfigs,
  backendApis,
  backendResources,
  mcpServers,
  publishEvents,
  runtimeSnapshots,
  scopes,
  secrets,
  toolMappings,
  toolScopes,
  tools
} from "../../db/schema.js";

export const configRepository = {
  getDraftContext: async (app: FastifyInstance, organizationId: string) => {
    const [authServerConfigRows, backendApiRows, mcpServerRows, scopeRows, secretRows, snapshotRows] = await Promise.all([
      app.db.select().from(authServerConfigs).where(eq(authServerConfigs.organizationId, organizationId)).limit(1),
      app.db.select().from(backendApis).where(eq(backendApis.organizationId, organizationId)),
      app.db.select().from(mcpServers).where(eq(mcpServers.organizationId, organizationId)),
      app.db.select().from(scopes).where(eq(scopes.organizationId, organizationId)),
      app.db.select().from(secrets).where(eq(secrets.organizationId, organizationId)),
      app.db.select().from(runtimeSnapshots).where(eq(runtimeSnapshots.organizationId, organizationId)).orderBy(desc(runtimeSnapshots.version)).limit(1)
    ]);

    const backendApiIds = backendApiRows.map((row) => row.id);
    const mcpServerIds = mcpServerRows.map((row) => row.id);

    const [backendResourceRows, toolRows] = await Promise.all([
      backendApiIds.length > 0
        ? app.db.select().from(backendResources).where(inArray(backendResources.backendApiId, backendApiIds))
        : [],
      mcpServerIds.length > 0
        ? app.db.select().from(tools).where(inArray(tools.mcpServerId, mcpServerIds))
        : []
    ]);

    const toolIds = toolRows.map((row) => row.id);
    const [mappingRows, toolScopeRows] = await Promise.all([
      toolIds.length > 0
        ? app.db.select().from(toolMappings).where(inArray(toolMappings.toolId, toolIds))
        : [],
      toolIds.length > 0
        ? app.db.select().from(toolScopes).where(inArray(toolScopes.toolId, toolIds))
        : []
    ]);

    return {
      authServerConfig: authServerConfigRows[0] ?? null,
      backendApis: backendApiRows,
      backendResources: backendResourceRows,
      mcpServers: mcpServerRows,
      tools: toolRows,
      scopes: scopeRows,
      toolMappings: mappingRows,
      toolScopes: toolScopeRows,
      secrets: secretRows,
      latestSnapshot: snapshotRows[0] ?? null
    };
  },
  insertSnapshot: async (app: FastifyInstance, values: typeof runtimeSnapshots.$inferInsert) => {
    const [row] = await app.db.insert(runtimeSnapshots).values(values).returning();
    return row;
  },
  insertPublishEvent: async (app: FastifyInstance, values: typeof publishEvents.$inferInsert) => {
    const [row] = await app.db.insert(publishEvents).values(values).returning();
    return row;
  },
  listSnapshots: (app: FastifyInstance, organizationId: string) =>
    app.db.select().from(runtimeSnapshots).where(eq(runtimeSnapshots.organizationId, organizationId)).orderBy(desc(runtimeSnapshots.version))
};
