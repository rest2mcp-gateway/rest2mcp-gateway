import type { FastifyInstance } from "fastify";
import { writeAuditEvent } from "../../lib/audit.js";
import { encryptSecret } from "../../lib/crypto.js";
import { maybeAutoPublishDraft } from "../config/auto-publish.js";
import { secretRepository } from "./repository.js";

export const secretService = {
  list: secretRepository.list,
  async create(app: FastifyInstance, actorId: string, values: {
    organizationId: string;
    name: string;
    description?: string;
    secretType: "api_key" | "token" | "password" | "certificate" | "other";
    storageMode: "database" | "external_ref";
    externalRef?: string;
    plaintextValue?: string;
    keyVersion: number;
    metadata: Record<string, unknown>;
  }) {
    const [row] = await secretRepository.create(app, {
      organizationId: values.organizationId,
      name: values.name,
      description: values.description,
      secretType: values.secretType,
      storageMode: values.storageMode,
      externalRef: values.externalRef,
      encryptedValue: values.plaintextValue ? encryptSecret(values.plaintextValue) : null,
      keyVersion: values.keyVersion,
      metadata: values.metadata
    });

    await writeAuditEvent(app, {
      organizationId: values.organizationId,
      actorType: "user",
      actorId,
      action: "secret.create",
      entityType: "secret",
      entityId: row.id,
      payload: { name: row.name, storageMode: row.storageMode, secretType: row.secretType }
    });

    await maybeAutoPublishDraft(app, actorId, values.organizationId, "secret.create");

    return row;
  }
};
