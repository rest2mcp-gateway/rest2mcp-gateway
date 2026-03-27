import { buildCatalogService } from "../catalog/factory.js";
import { scopeRepository } from "./repository.js";

export const scopeService = buildCatalogService("scope", scopeRepository, {
  autoPublish: true
});
