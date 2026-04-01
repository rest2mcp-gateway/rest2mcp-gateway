import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { mcpServerRepository } from "./repository.js";

export const mcpServerService = {
  list: mcpServerRepository.list,
  async create(app: FastifyInstance, actorId: string, organizationId: string, values: any) {
    const createdRows = await mcpServerRepository.create(app, values) as Array<Record<string, unknown>>;
    const row = createdRows[0];
    if (!row) {
      throw new Error("Failed to create mcp_server");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "mcp_server.create",
      entityType: "mcp_server",
      entityId: String(row.id),
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "mcp_server.create");
    return row;
  },
  async update(app: FastifyInstance, actorId: string, organizationId: string, id: string, values: any) {
    const updatedRows = await mcpServerRepository.update(app, id, values) as Array<Record<string, unknown>>;
    const row = updatedRows[0];
    if (!row) {
      throw new AppError(404, "mcp_server not found", "mcp_server_not_found");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "mcp_server.update",
      entityType: "mcp_server",
      entityId: String(row.id),
      payload: values
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "mcp_server.update");
    return row;
  },
  async delete(app: FastifyInstance, actorId: string, organizationId: string, id: string) {
    const existing = await mcpServerRepository.getById(app, organizationId, id);
    if (!existing) {
      throw new AppError(404, "mcp_server not found", "mcp_server_not_found");
    }

    const deletedRows = await mcpServerRepository.delete(app, id) as Array<Record<string, unknown>>;
    const row = deletedRows[0];
    if (!row) {
      throw new AppError(404, "mcp_server not found", "mcp_server_not_found");
    }

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "mcp_server.delete",
      entityType: "mcp_server",
      entityId: String(row.id),
      payload: { name: existing.name, slug: existing.slug }
    });

    await maybeAutoPublishDraft(app, actorId, organizationId, "mcp_server.delete");
    return row;
  }
};
