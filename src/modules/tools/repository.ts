import { tools } from "../../db/schema.js";
import { buildCatalogRepository } from "../catalog/factory.js";

export const toolRepository = buildCatalogRepository(tools, "name");
