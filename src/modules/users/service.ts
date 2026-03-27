import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { userRepository } from "./repository.js";

export const userService = {
  list: userRepository.list,
  async create(app: FastifyInstance, actorId: string, values: Parameters<typeof userRepository.create>[1]) {
    const row = await userRepository.create(app, values);
    await writeAuditEvent(app, {
      organizationId: row.organizationId,
      actorType: "user",
      actorId,
      action: "user.create",
      entityType: "user",
      entityId: row.id,
      payload: { email: row.email, role: row.role }
    });
    return row;
  },
  async update(app: FastifyInstance, actorId: string, id: string, values: Parameters<typeof userRepository.update>[2]) {
    const row = await userRepository.update(app, id, values);
    if (!row) {
      throw new AppError(404, "User not found", "user_not_found");
    }
    await writeAuditEvent(app, {
      organizationId: row.organizationId,
      actorType: "user",
      actorId,
      action: "user.update",
      entityType: "user",
      entityId: row.id,
      payload: values
    });
    return row;
  }
};
