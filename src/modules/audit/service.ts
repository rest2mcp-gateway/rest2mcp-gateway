import { auditRepository } from "./repository.js";

export const auditService = {
  listByOrganization: auditRepository.listByOrganization
};
