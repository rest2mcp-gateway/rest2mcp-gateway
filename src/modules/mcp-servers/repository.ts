import { mcpServers } from "../../db/schema.js";
import { buildCatalogRepository } from "../catalog/factory.js";

export const mcpServerRepository = buildCatalogRepository(mcpServers, "name");
