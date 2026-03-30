import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { backendApis, mcpServers, toolMappings, tools } from "../../db/schema.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { backendResourceRepository } from "./repository.js";

type BackendResourceWriteInput = {
  backendApiId?: string | undefined;
  name?: string | undefined;
  operationId?: string | undefined;
  description?: string | undefined;
  httpMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | undefined;
  pathTemplate?: string | undefined;
  bodyTemplate?: string | undefined;
  requestSchema?: Record<string, unknown> | undefined;
  responseSchema?: Record<string, unknown> | undefined;
  isActive?: boolean | undefined;
};

const getBackendApiForOrganization = async (
  app: FastifyInstance,
  organizationId: string,
  backendApiId: string
) => {
  const [row] = await app.db
    .select()
    .from(backendApis)
    .where(and(eq(backendApis.id, backendApiId), eq(backendApis.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    throw new AppError(404, "Backend API not found", "backend_api_not_found");
  }

  return row;
};

const omitUndefined = <T extends Record<string, unknown>>(values: T) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

const listResourceDependencies = async (app: FastifyInstance, backendResourceId: string) =>
  app.db
    .select({
      toolId: tools.id,
      toolName: tools.name,
      serverId: mcpServers.id,
      serverName: mcpServers.name
    })
    .from(toolMappings)
    .innerJoin(tools, eq(toolMappings.toolId, tools.id))
    .innerJoin(mcpServers, eq(tools.mcpServerId, mcpServers.id))
    .where(eq(toolMappings.backendResourceId, backendResourceId));

const buildDependencyMessage = (
  entityLabel: string,
  references: Array<{ toolName: string; serverName: string }>
) => {
  const preview = references
    .slice(0, 3)
    .map((reference) => `${reference.toolName} (${reference.serverName})`)
    .join(", ");
  const suffix = references.length > 3 ? `, and ${references.length - 3} more` : "";
  return `Cannot delete ${entityLabel} because it is referenced by ${references.length} tool mapping${references.length === 1 ? "" : "s"}: ${preview}${suffix}.`;
};

export const backendResourceService = {
  list(app: FastifyInstance, organizationId: string, query: { backendApiId?: string | undefined; page: number; pageSize: number; search?: string | undefined }) {
    return backendResourceRepository.list(app, organizationId, query);
  },

  async create(app: FastifyInstance, actorId: string, organizationId: string, values: Required<Pick<BackendResourceWriteInput, "backendApiId">> & BackendResourceWriteInput) {
    const backendApiId = values.backendApiId;
    if (!backendApiId) {
      throw new AppError(400, "backendApiId is required", "missing_backend_api_id");
    }

    await getBackendApiForOrganization(app, organizationId, backendApiId);

    const row = await backendResourceRepository.create(app, {
      backendApiId,
      name: values.name ?? "",
      operationId: values.operationId ?? "",
      description: values.description ?? null,
      httpMethod: values.httpMethod ?? "GET",
      pathTemplate: values.pathTemplate ?? "",
      bodyTemplate: values.bodyTemplate ?? null,
      requestSchema: values.requestSchema ?? {},
      responseSchema: values.responseSchema ?? {},
      isActive: values.isActive ?? true
    });

    if (!row) {
      throw new AppError(500, "Failed to create backend resource", "backend_resource_create_failed");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "backend_resource.create",
      entityType: "backend_resource",
      entityId: row.id,
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "backend_resource.create");

    return row;
  },

  async update(app: FastifyInstance, actorId: string, organizationId: string, resourceId: string, values: BackendResourceWriteInput) {
    const existing = await backendResourceRepository.getById(app, organizationId, resourceId);
    if (!existing) {
      throw new AppError(404, "backend_resource not found", "backend_resource_not_found");
    }

    const row = await backendResourceRepository.update(app, resourceId, omitUndefined({
      name: values.name,
      operationId: values.operationId,
      description: values.description,
      httpMethod: values.httpMethod,
      pathTemplate: values.pathTemplate,
      bodyTemplate: values.bodyTemplate,
      requestSchema: values.requestSchema,
      responseSchema: values.responseSchema,
      isActive: values.isActive
    }));

    if (!row) {
      throw new AppError(500, "Failed to update backend resource", "backend_resource_update_failed");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "backend_resource.update",
      entityType: "backend_resource",
      entityId: row.id,
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "backend_resource.update");

    return row;
  },

  async delete(app: FastifyInstance, actorId: string, organizationId: string, resourceId: string) {
    const existing = await backendResourceRepository.getById(app, organizationId, resourceId);
    if (!existing) {
      throw new AppError(404, "backend_resource not found", "backend_resource_not_found");
    }

    const references = await listResourceDependencies(app, resourceId);
    if (references.length > 0) {
      throw new AppError(409, buildDependencyMessage("backend resource", references), "backend_resource_in_use", {
        references
      });
    }

    await app.db.delete(toolMappings).where(eq(toolMappings.backendResourceId, resourceId));

    const row = await backendResourceRepository.delete(app, resourceId);
    if (!row) {
      throw new AppError(500, "Failed to delete backend resource", "backend_resource_delete_failed");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "backend_resource.delete",
      entityType: "backend_resource",
      entityId: row.id,
      payload: {
        backendApiId: existing.backendApiId,
        name: existing.name,
        operationId: existing.operationId
      }
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "backend_resource.delete");

    return row;
  }
};
