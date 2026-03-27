import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { writeAuditEvent } from "../../lib/audit.js";
import { organizations } from "../../db/schema.js";
import { configRepository } from "./repository.js";
import { runtimeService } from "../runtime/service.js";

const validateDraftContext = (context: Awaited<ReturnType<typeof configRepository.getDraftContext>>) => {
  const issues: string[] = [];

  if (context.mcpServers.length === 0) {
    issues.push("At least one MCP server is required");
  }

  if (context.tools.some((tool) => !context.mcpServers.some((server) => server.id === tool.mcpServerId))) {
    issues.push("Every tool must reference an existing MCP server");
  }

  if (context.toolMappings.some((mapping) => !context.tools.some((tool) => tool.id === mapping.toolId))) {
    issues.push("Every tool mapping must reference an existing tool");
  }

  if (context.toolMappings.some((mapping) => !context.backendResources.some((resource) => resource.id === mapping.backendResourceId))) {
    issues.push("Every tool mapping must reference an existing backend resource");
  }

  if (context.tools.some((tool) => !context.toolMappings.some((mapping) => mapping.toolId === tool.id))) {
    issues.push("Every tool must define a backend mapping before publish");
  }

  if (new Set(context.toolMappings.map((mapping) => mapping.toolId)).size !== context.toolMappings.length) {
    issues.push("Each tool may only define one mapping");
  }

  if (context.toolMappings.some((mapping) => {
    const resource = context.backendResources.find((item) => item.id === mapping.backendResourceId);
    return resource ? resource.backendApiId !== mapping.backendApiId : false;
  })) {
    issues.push("Every tool mapping must reference a backend resource belonging to the selected backend API");
  }

  return issues;
};

export const configService = {
  async validate(app: FastifyInstance, organizationId: string) {
    const context = await configRepository.getDraftContext(app, organizationId);
    return validateDraftContext(context);
  },
  async publish(app: FastifyInstance, actorId: string, organizationId: string, notes?: string) {
    const context = await configRepository.getDraftContext(app, organizationId);
    const issues = validateDraftContext(context);
    if (issues.length > 0) {
      return { published: false, issues };
    }

    const version = (context.latestSnapshot?.version ?? 0) + 1;
    const snapshot = {
      version,
      generatedAt: new Date().toISOString(),
      backendApis: context.backendApis,
      backendResources: context.backendResources,
      mcpServers: context.mcpServers,
      tools: context.tools,
      scopes: context.scopes,
      toolMappings: context.toolMappings,
      toolScopes: context.toolScopes,
      secrets: context.secrets.map((secret) => ({
        id: secret.id,
        name: secret.name,
        storageMode: secret.storageMode,
        externalRef: secret.externalRef,
        keyVersion: secret.keyVersion,
        metadata: secret.metadata,
        hasEncryptedValue: Boolean(secret.encryptedValue)
      }))
    };

    const snapshotRow = await configRepository.insertSnapshot(app, {
      organizationId,
      version,
      status: "published",
      snapshotJson: snapshot,
      createdBy: actorId,
      publishedAt: new Date()
    });

    await configRepository.insertPublishEvent(app, {
      organizationId,
      snapshotId: snapshotRow.id,
      version,
      publishedBy: actorId,
      notes
    });

    await writeAuditEvent(app, {
      organizationId,
      actorType: "user",
      actorId,
      action: "config.publish",
      entityType: "runtime_snapshot",
      entityId: snapshotRow.id,
      payload: { version, notes }
    });

    app.log.info({ organizationId, version }, "published runtime snapshot");
    const [organization] = await app.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (organization) {
      runtimeService.invalidateOrganizationCache(organization.slug);
    }

    return {
      published: true,
      issues: [],
      snapshot: snapshotRow
    };
  },
  listSnapshots: configRepository.listSnapshots
};
