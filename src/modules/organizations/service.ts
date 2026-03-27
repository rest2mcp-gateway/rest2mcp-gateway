import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { organizationRepository } from "./repository.js";

export const organizationService = {
  list(app: FastifyInstance, query: { page: number; pageSize: number; search?: string }) {
    return organizationRepository.list(app, query);
  },
  async get(app: FastifyInstance, id: string) {
    const row = await organizationRepository.getById(app, id);
    if (!row) {
      throw new AppError(404, "Organization not found", "organization_not_found");
    }
    return row;
  },
  async create(app: FastifyInstance, actorId: string, values: { name: string; slug: string }) {
    const [row] = await organizationRepository.create(app, values);
    await writeAuditEvent(app, {
      organizationId: row.id,
      actorType: "user",
      actorId,
      action: "organization.create",
      entityType: "organization",
      entityId: row.id,
      payload: values
    });
    return row;
  }
};
