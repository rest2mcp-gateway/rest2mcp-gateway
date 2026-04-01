import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { organizations } from "../../db/schema.js";
import { listEntities } from "../common/crud.js";

export const organizationRepository = {
  list: (app: FastifyInstance, query: { page: number; pageSize: number; search?: string | undefined }) =>
    listEntities(app, organizations, { ...query, searchColumn: "name" }),
  getById: (app: FastifyInstance, id: string) =>
    app.db.query.organizations.findFirst({ where: eq(organizations.id, id) }),
  create: (app: FastifyInstance, values: typeof organizations.$inferInsert) =>
    app.db.insert(organizations).values(values).returning(),
  update: (app: FastifyInstance, id: string, values: Partial<typeof organizations.$inferInsert>) =>
    app.db.update(organizations).set(values).where(eq(organizations.id, id)).returning(),
  delete: (app: FastifyInstance, id: string) =>
    app.db.delete(organizations).where(eq(organizations.id, id)).returning()
};
