import type { FastifyInstance } from "fastify";
import { auditEvents } from "../db/schema.js";

type AuditInput = {
  organizationId: string;
  actorType: "user" | "system";
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload?: unknown;
};

export const writeAuditEvent = async (app: FastifyInstance, input: AuditInput) => {
  await app.db.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? {}
  });
};
