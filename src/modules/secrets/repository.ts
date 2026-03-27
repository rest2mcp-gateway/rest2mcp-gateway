import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { secrets } from "../../db/schema.js";
import { listEntities } from "../common/crud.js";

export const secretRepository = {
  list: (app: FastifyInstance, query: { organizationId?: string; page: number; pageSize: number; search?: string }) =>
    listEntities(app, secrets, { ...query, searchColumn: "name" }),
  create: (app: FastifyInstance, values: typeof secrets.$inferInsert) =>
    app.db.insert(secrets).values(values).returning(),
  update: (app: FastifyInstance, id: string, values: Partial<typeof secrets.$inferInsert>) =>
    app.db.update(secrets).set(values).where(eq(secrets.id, id)).returning()
};
