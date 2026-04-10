import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { writeAuditEvent } from "../../lib/audit.js";
import { organizations } from "../../db/schema.js";
import { configRepository } from "./repository.js";
import { runtimeService } from "../runtime/service.js";

export type DraftContext = Awaited<ReturnType<typeof configRepository.getDraftContext>>;

export const validateDraftContext = (context: DraftContext) => {
  const issues: string[] = [];

  if (context.mcpServers.length === 0) {
    issues.push("At least one MCP server is required");
  }

  if (
    context.mcpServers.some((server) => server.accessMode === "protected") &&
    !context.authServerConfig
  ) {
    issues.push("A protected MCP server requires an authorization server configuration");
  }

  if (
    context.mcpServers.some((server) => server.accessMode === "protected" && !server.audience)
  ) {
    issues.push("Every protected MCP server must define an audience");
  }

  const tokenExchangeApis = context.backendApis.filter((api) => api.tokenExchangeEnabled === true);
  if (tokenExchangeApis.length > 0 && !context.authServerConfig) {
    issues.push("Token exchange requires an authorization server configuration");
  }

  if (
    tokenExchangeApis.length > 0 &&
    (!context.authServerConfig?.tokenEndpoint ||
      !context.authServerConfig?.clientId ||
      !context.authServerConfig?.encryptedClientSecret)
  ) {
    issues.push("Token exchange requires token endpoint, client ID, and client secret on the authorization server configuration");
  }

  if (tokenExchangeApis.some((api) => !api.tokenExchangeAudience)) {
    issues.push("Every backend API with token exchange enabled must define a token exchange audience");
  }

  if (tokenExchangeApis.some((api) => ["bearer", "basic", "oauth2"].includes(api.authType))) {
    issues.push("Token exchange can only be combined with none or API key backend auth");
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

  if (context.toolMappings.some((mapping) => {
    const backendApi = context.backendApis.find((api) => api.id === mapping.backendApiId);
    const tool = context.tools.find((item) => item.id === mapping.toolId);
    const server = tool ? context.mcpServers.find((item) => item.id === tool.mcpServerId) : null;
    return backendApi?.tokenExchangeEnabled === true && server?.accessMode !== "protected";
  })) {
    issues.push("Backend APIs using token exchange may only be mapped to protected MCP servers");
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
      authServerConfig: context.authServerConfig,
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
    if (!snapshotRow) {
      throw new Error("Failed to insert runtime snapshot");
    }

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
