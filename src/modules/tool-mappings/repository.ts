import { toolMappings } from "../../db/schema.js";
import { buildCatalogRepository } from "../catalog/factory.js";

export const toolMappingRepository = buildCatalogRepository(toolMappings, "authStrategy");
