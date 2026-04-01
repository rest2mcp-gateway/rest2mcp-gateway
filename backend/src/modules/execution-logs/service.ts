import { executionLogRepository } from "./repository.js";

export const executionLogService = {
  listByOrganization: executionLogRepository.listByOrganization
};
