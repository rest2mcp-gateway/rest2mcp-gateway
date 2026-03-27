import { scopes } from "../../db/schema.js";
import { buildCatalogRepository } from "../catalog/factory.js";

export const scopeRepository = buildCatalogRepository(scopes, "name");
