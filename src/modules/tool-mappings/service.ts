import { and, asc, count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { backendApis, backendResources, mcpServers, toolMappings, tools } from "../../db/schema.js";

type ToolMappingWriteInput = {
  toolId?: string | undefined;
  backendApiId?: string | undefined;
  backendResourceId?: string | undefined;
  requestMapping?: Record<string, unknown> | undefined;
  responseMapping?: Record<string, unknown> | undefined;
  errorMapping?: Record<string, unknown> | undefined;
  authStrategy?: string | undefined;
  timeoutOverrideMs?: number | null | undefined;
  retryOverride?: Record<string, unknown> | null | undefined;
  isActive?: boolean | undefined;
};

const getToolForOrganization = async (app: FastifyInstance, organizationId: string, toolId: string) => {
  const [row] = await app.db
    .select({ tool: tools })
    .from(tools)
    .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
    .where(and(eq(tools.id, toolId), eq(mcpServers.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new AppError(400, "Tool not found", "tool_not_found");
  }

  return row.tool;
};

const getResourceForOrganization = async (app: FastifyInstance, organizationId: string, backendResourceId: string) => {
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
    throw new AppError(400, "Backend resource not found", "backend_resource_not_found");
  }

  return row;
};

const ensureToolHasNoOtherMapping = async (app: FastifyInstance, toolId: string, mappingId?: string) => {
  const [existing] = await app.db.select().from(toolMappings).where(eq(toolMappings.toolId, toolId)).limit(1);
  if (existing && existing.id !== mappingId) {
    throw new AppError(409, "A tool can only have one mapping", "tool_mapping_conflict");
  }
};

export const toolMappingService = {
  async list(app: FastifyInstance, query: { toolId?: string | undefined; page: number; pageSize: number }, organizationId: string) {
    const conditions = [eq(mcpServers.organizationId, organizationId)];
    if (query.toolId) {
      conditions.push(eq(toolMappings.toolId, query.toolId));
    }

    const where = and(...conditions);
    const rows = await app.db
      .select({ mapping: toolMappings })
      .from(toolMappings)
      .innerJoin(tools, eq(toolMappings.toolId, tools.id))
      .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
      .where(where)
      .orderBy(asc(toolMappings.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [totalRow] = await app.db
      .select({ total: count() })
      .from(toolMappings)
      .innerJoin(tools, eq(toolMappings.toolId, tools.id))
      .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
      .where(where);
    const total = totalRow?.total ?? 0;

    return {
      rows: rows.map((row) => row.mapping),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.ceil(total / query.pageSize)
      }
    };
  },

  async create(app: FastifyInstance, actorId: string, organizationId: string, values: Required<Pick<ToolMappingWriteInput, "toolId" | "backendResourceId">> & ToolMappingWriteInput) {
    const toolId = values.toolId;
    const backendResourceId = values.backendResourceId;
    if (!toolId || !backendResourceId) {
      throw new AppError(400, "toolId and backendResourceId are required", "missing_mapping_fields");
    }

    await getToolForOrganization(app, organizationId, toolId);
    const { resource, backendApi } = await getResourceForOrganization(app, organizationId, backendResourceId);

    if (values.backendApiId && values.backendApiId !== backendApi.id) {
      throw new AppError(400, "Backend resource does not belong to the selected backend API", "backend_api_resource_mismatch");
    }

    await ensureToolHasNoOtherMapping(app, toolId);

    const [row] = await app.db.insert(toolMappings).values({
      toolId,
      backendApiId: backendApi.id,
      backendResourceId: resource.id,
      requestMapping: values.requestMapping ?? {},
      responseMapping: values.responseMapping ?? {},
      errorMapping: values.errorMapping ?? {},
      authStrategy: values.authStrategy ?? "inherit",
      timeoutOverrideMs: values.timeoutOverrideMs ?? null,
      retryOverride: values.retryOverride ?? null,
      isActive: values.isActive ?? true
    }).returning();
    if (!row) {
      throw new AppError(500, "Failed to create tool mapping", "tool_mapping_create_failed");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "tool_mapping.create",
      entityType: "tool_mapping",
      entityId: row.id,
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "tool_mapping.create");

    return row;
  },

  async update(app: FastifyInstance, actorId: string, organizationId: string, mappingId: string, values: ToolMappingWriteInput) {
    const [existing] = await app.db
      .select({ mapping: toolMappings })
      .from(toolMappings)
      .innerJoin(tools, eq(toolMappings.toolId, tools.id))
      .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
      .where(and(eq(toolMappings.id, mappingId), eq(mcpServers.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      throw new AppError(404, "tool_mapping not found", "tool_mapping_not_found");
    }

    const nextToolId = values.toolId ?? existing.mapping.toolId;
    const nextBackendResourceId = values.backendResourceId ?? existing.mapping.backendResourceId;

    await getToolForOrganization(app, organizationId, nextToolId);
    const { resource, backendApi } = await getResourceForOrganization(app, organizationId, nextBackendResourceId);

    if (values.backendApiId && values.backendApiId !== backendApi.id) {
      throw new AppError(400, "Backend resource does not belong to the selected backend API", "backend_api_resource_mismatch");
    }

    await ensureToolHasNoOtherMapping(app, nextToolId, existing.mapping.id);

    const [row] = await app.db.update(toolMappings).set({
      toolId: nextToolId,
      backendApiId: backendApi.id,
      backendResourceId: resource.id,
      requestMapping: values.requestMapping ?? existing.mapping.requestMapping,
      responseMapping: values.responseMapping ?? existing.mapping.responseMapping,
      errorMapping: values.errorMapping ?? existing.mapping.errorMapping,
      authStrategy: values.authStrategy ?? existing.mapping.authStrategy,
      timeoutOverrideMs: values.timeoutOverrideMs ?? existing.mapping.timeoutOverrideMs,
      retryOverride: values.retryOverride ?? existing.mapping.retryOverride,
      isActive: values.isActive ?? existing.mapping.isActive
    }).where(eq(toolMappings.id, existing.mapping.id)).returning();
    if (!row) {
      throw new AppError(500, "Failed to update tool mapping", "tool_mapping_update_failed");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "tool_mapping.update",
      entityType: "tool_mapping",
      entityId: row.id,
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "tool_mapping.update");

    return row;
  }
};
