import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAuditEvent } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { backendApis } from "../../db/schema.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { backendResourceRepository } from "./repository.js";

type BackendResourceWriteInput = {
  backendApiId?: string;
  name?: string;
  operationId?: string;
  description?: string;
  httpMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathTemplate?: string;
  bodyTemplate?: string;
  requestSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  isActive?: boolean;
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
    throw new AppError(400, "Backend API not found", "backend_api_not_found");
  }

  return row;
};

const omitUndefined = <T extends Record<string, unknown>>(values: T) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

export const backendResourceService = {
  list(app: FastifyInstance, organizationId: string, query: { backendApiId?: string; page: number; pageSize: number; search?: string }) {
    return backendResourceRepository.list(app, organizationId, query);
  },

  async create(app: FastifyInstance, actorId: string, organizationId: string, values: Required<Pick<BackendResourceWriteInput, "backendApiId">> & BackendResourceWriteInput) {
    await getBackendApiForOrganization(app, organizationId, values.backendApiId);

    const row = await backendResourceRepository.create(app, {
      backendApiId: values.backendApiId,
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
  }
};
