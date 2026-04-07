import { and, asc, count, eq, ilike, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import {
  backendApis,
  backendResources,
  mcpServers,
  scopes,
  toolMappings,
  toolScopes,
  tools
} from "../../db/schema.js";

type ToolMappingInput = {
  backendResourceId: string;
  requestMapping?: Record<string, unknown> | undefined;
  responseMapping?: Record<string, unknown> | undefined;
  errorMapping?: Record<string, unknown> | undefined;
  authStrategy?: string | undefined;
  timeoutOverrideMs?: number | null | undefined;
  retryOverride?: Record<string, unknown> | null | undefined;
  isActive?: boolean | undefined;
};

type ToolWriteInput = {
  mcpServerId?: string | undefined;
  name?: string | undefined;
  slug?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  inputSchema?: Record<string, unknown> | undefined;
  outputSchema?: Record<string, unknown> | undefined;
  examples?: unknown[] | undefined;
  riskLevel?: string | undefined;
  isActive?: boolean | undefined;
  scopeIds?: string[] | undefined;
  mapping?: ToolMappingInput | null | undefined;
};

const buildPagination = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  pageCount: Math.ceil(total / pageSize)
});

const omitUndefined = <T extends Record<string, unknown>>(values: T) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

const enrichTools = async (app: FastifyInstance, rows: Array<typeof tools.$inferSelect>) => {
  if (rows.length === 0) {
    return [];
  }

  const toolIds = rows.map((row) => row.id);
  const [scopeRows, mappingRows] = await Promise.all([
    app.db.select().from(toolScopes).where(inArray(toolScopes.toolId, toolIds)),
    app.db.select().from(toolMappings).where(inArray(toolMappings.toolId, toolIds))
  ]);

  const scopeIdsByToolId = new Map<string, string[]>();
  for (const row of scopeRows) {
    const current = scopeIdsByToolId.get(row.toolId) ?? [];
    current.push(row.scopeId);
    scopeIdsByToolId.set(row.toolId, current);
  }

  const mappingByToolId = new Map(mappingRows.map((row) => [row.toolId, row]));

  return rows.map((row) => ({
    ...row,
    scopeIds: scopeIdsByToolId.get(row.id) ?? [],
    mapping: mappingByToolId.get(row.id)
      ? {
          id: mappingByToolId.get(row.id)!.id,
          backendApiId: mappingByToolId.get(row.id)!.backendApiId,
          backendResourceId: mappingByToolId.get(row.id)!.backendResourceId,
          requestMapping: mappingByToolId.get(row.id)!.requestMapping,
          responseMapping: mappingByToolId.get(row.id)!.responseMapping,
          errorMapping: mappingByToolId.get(row.id)!.errorMapping,
          authStrategy: mappingByToolId.get(row.id)!.authStrategy,
          timeoutOverrideMs: mappingByToolId.get(row.id)!.timeoutOverrideMs,
          retryOverride: mappingByToolId.get(row.id)!.retryOverride,
          isActive: mappingByToolId.get(row.id)!.isActive
        }
      : null
  }));
};

const getServerForOrganization = async (app: FastifyInstance, organizationId: string, serverId: string) => {
  const [server] = await app.db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.organizationId, organizationId)))
    .limit(1);

  if (!server) {
    throw new AppError(404, "MCP server not found", "mcp_server_not_found");
  }

  return server;
};

const getToolForOrganization = async (app: FastifyInstance, organizationId: string, toolId: string) => {
  const [row] = await app.db
    .select({ tool: tools })
    .from(tools)
    .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
    .where(and(eq(tools.id, toolId), eq(mcpServers.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new AppError(404, "Tool not found", "tool_not_found");
  }

  return row.tool;
};

const getScopeRowsForOrganization = async (app: FastifyInstance, organizationId: string, scopeIds: string[]) => {
  const uniqueScopeIds = Array.from(new Set(scopeIds));
  if (uniqueScopeIds.length === 0) {
    return [];
  }

  const rows = await app.db
    .select()
    .from(scopes)
    .where(and(eq(scopes.organizationId, organizationId), inArray(scopes.id, uniqueScopeIds)));

  if (rows.length !== uniqueScopeIds.length) {
    throw new AppError(400, "One or more scopes are invalid", "invalid_scope_ids");
  }

  return rows;
};

const getBackendResourceForOrganization = async (app: FastifyInstance, organizationId: string, backendResourceId: string) => {
  const [row] = await app.db
    .select({
      resource: backendResources,
      backendApi: backendApis
    })
    .from(backendResources)
    .innerJoin(backendApis, eq(backendResources.backendApiId, backendApis.id))
    .where(and(eq(backendResources.id, backendResourceId), eq(backendApis.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new AppError(404, "Backend resource not found", "backend_resource_not_found");
  }

  return row;
};

const replaceToolScopes = async (app: FastifyInstance, toolId: string, scopeIds: string[]) => {
  const uniqueScopeIds = Array.from(new Set(scopeIds));
  await app.db.delete(toolScopes).where(eq(toolScopes.toolId, toolId));
  if (uniqueScopeIds.length > 0) {
    await app.db.insert(toolScopes).values(uniqueScopeIds.map((scopeId) => ({ toolId, scopeId })));
  }
};

const syncToolMapping = async (
  app: FastifyInstance,
  organizationId: string,
  toolId: string,
  mapping: ToolMappingInput | null | undefined
) => {
  if (mapping === undefined) {
    return;
  }

  if (mapping === null) {
    await app.db.delete(toolMappings).where(eq(toolMappings.toolId, toolId));
    return;
  }

  const { resource, backendApi } = await getBackendResourceForOrganization(app, organizationId, mapping.backendResourceId);
  const [existing] = await app.db.select().from(toolMappings).where(eq(toolMappings.toolId, toolId)).limit(1);

  const values = {
    toolId,
    backendApiId: backendApi.id,
    backendResourceId: resource.id,
    requestMapping: mapping.requestMapping ?? {},
    responseMapping: mapping.responseMapping ?? {},
    errorMapping: mapping.errorMapping ?? {},
    authStrategy: mapping.authStrategy ?? "inherit",
    timeoutOverrideMs: mapping.timeoutOverrideMs ?? null,
    retryOverride: mapping.retryOverride ?? null,
    isActive: mapping.isActive ?? true
  };

  if (existing) {
    await app.db.update(toolMappings).set(omitUndefined(values)).where(eq(toolMappings.id, existing.id));
    return;
  }

    await app.db.insert(toolMappings).values(values);
};

export const toolService = {
  async list(app: FastifyInstance, query: { mcpServerId?: string | undefined; page: number; pageSize: number; search?: string | undefined; isActive?: boolean | undefined }, organizationId: string) {
    const conditions = [eq(mcpServers.organizationId, organizationId)];

    if (query.mcpServerId) {
      conditions.push(eq(tools.mcpServerId, query.mcpServerId));
    }
    if (typeof query.isActive === "boolean") {
      conditions.push(eq(tools.isActive, query.isActive));
    }
    if (query.search) {
      conditions.push(ilike(tools.name, `%${query.search}%`));
    }

    const where = and(...conditions);
    const rows = await app.db
      .select({ tool: tools })
      .from(tools)
      .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
      .where(where)
      .orderBy(asc(tools.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [totalRow] = await app.db
      .select({ total: count() })
      .from(tools)
      .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
      .where(where);
    const total = totalRow?.total ?? 0;

    return {
      rows: await enrichTools(app, rows.map((row) => row.tool)),
      pagination: buildPagination(query.page, query.pageSize, total)
    };
  },

  async get(app: FastifyInstance, organizationId: string, toolId: string) {
    const row = await getToolForOrganization(app, organizationId, toolId);
    const [tool] = await enrichTools(app, [row]);
    if (!tool) {
      throw new AppError(404, "Tool not found", "tool_not_found");
    }
    return tool;
  },

  async create(app: FastifyInstance, actorId: string, organizationId: string, values: Required<Pick<ToolWriteInput, "mcpServerId">> & ToolWriteInput) {
    const mcpServerId = values.mcpServerId;
    if (!mcpServerId) {
      throw new AppError(400, "mcpServerId is required", "missing_mcp_server_id");
    }

    await getServerForOrganization(app, organizationId, mcpServerId);
    await getScopeRowsForOrganization(app, organizationId, values.scopeIds ?? []);

    const [row] = await app.db.insert(tools).values({
      mcpServerId,
      name: values.name ?? "",
      slug: values.slug ?? "",
      title: values.title ?? "",
      description: values.description,
      inputSchema: values.inputSchema ?? {},
      outputSchema: values.outputSchema ?? {},
      examples: values.examples ?? [],
      riskLevel: values.riskLevel ?? "low",
      isActive: values.isActive ?? true
    }).returning();
    if (!row) {
      throw new AppError(500, "Failed to create tool", "tool_create_failed");
    }

    await replaceToolScopes(app, row.id, values.scopeIds ?? []);
    await syncToolMapping(app, organizationId, row.id, values.mapping);

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "tool.create",
      entityType: "tool",
      entityId: row.id,
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "tool.create");

    return this.get(app, organizationId, row.id);
  },

  async update(app: FastifyInstance, actorId: string, organizationId: string, toolId: string, values: ToolWriteInput) {
    const existing = await getToolForOrganization(app, organizationId, toolId);

    if (values.scopeIds) {
      await getScopeRowsForOrganization(app, organizationId, values.scopeIds);
    }

    const updateValues = omitUndefined({
      name: values.name,
      slug: values.slug,
      title: values.title,
      description: values.description,
      inputSchema: values.inputSchema,
      outputSchema: values.outputSchema,
      examples: values.examples,
      riskLevel: values.riskLevel,
      isActive: values.isActive
    });

    if (Object.keys(updateValues).length > 0) {
      await app.db.update(tools).set(updateValues).where(eq(tools.id, existing.id));
    }

    if (values.scopeIds) {
      await replaceToolScopes(app, existing.id, values.scopeIds);
    }

    await syncToolMapping(app, organizationId, existing.id, values.mapping);

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "tool.update",
      entityType: "tool",
      entityId: existing.id,
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "tool.update");

    return this.get(app, organizationId, existing.id);
  },

  async delete(app: FastifyInstance, actorId: string, organizationId: string, toolId: string) {
    const existing = await getToolForOrganization(app, organizationId, toolId);

    await app.db.delete(toolScopes).where(eq(toolScopes.toolId, existing.id));
    await app.db.delete(toolMappings).where(eq(toolMappings.toolId, existing.id));

    const [row] = await app.db.delete(tools).where(eq(tools.id, existing.id)).returning();
    if (!row) {
      throw new AppError(404, "Tool not found", "tool_not_found");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "tool.delete",
      entityType: "tool",
      entityId: existing.id,
      payload: {
        mcpServerId: existing.mcpServerId,
        name: existing.name,
        slug: existing.slug
      }
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "tool.delete");

    return row;
  }
};
