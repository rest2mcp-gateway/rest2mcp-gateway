import { buildCatalogService } from "../catalog/factory.js";
import { mcpServerRepository } from "./repository.js";

export const mcpServerService = buildCatalogService("mcp_server", mcpServerRepository, {
  autoPublish: true
});
