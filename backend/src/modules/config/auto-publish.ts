import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { configService } from "./service.js";

export const maybeAutoPublishDraft = async (
  app: FastifyInstance,
  actorId: string,
  organizationId: string,
  reason: string
) => {
  if (env.NODE_ENV !== "development") {
    return;
  }

  const result = await configService.publish(
    app,
    actorId,
    organizationId,
    `Development auto-publish: ${reason}`
  );

  if (result.published) {
    app.log.info(
      { organizationId, version: result.snapshot?.version, reason },
      "development auto-publish completed"
    );
    return;
  }

  app.log.warn(
    { organizationId, reason, issues: result.issues },
    "development auto-publish skipped because draft validation failed"
  );
};
