import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { users } from "../../db/schema.js";
import { listEntities } from "../common/crud.js";

export const userRepository = {
  list: (app: FastifyInstance, query: { organizationId?: string; page: number; pageSize: number; search?: string; isActive?: boolean }) =>
    listEntities(app, users, { ...query, searchColumn: "email" }),
  create: async (app: FastifyInstance, values: typeof users.$inferInsert & { password?: string }) => {
    const passwordHash = values.password ? await bcrypt.hash(values.password, 12) : null;
    const [row] = await app.db.insert(users).values({
      organizationId: values.organizationId,
      email: values.email,
      name: values.name,
      role: values.role,
      authMode: values.authMode,
      passwordHash,
      isActive: values.isActive
    }).returning();
    return row;
  },
  getById: (app: FastifyInstance, id: string) =>
    app.db.query.users.findFirst({ where: eq(users.id, id) }),
  update: async (app: FastifyInstance, id: string, values: Partial<typeof users.$inferInsert> & { password?: string }) => {
    const passwordHash = values.password ? await bcrypt.hash(values.password, 12) : undefined;
    const [row] = await app.db.update(users).set({
      ...values,
      passwordHash
    }).where(eq(users.id, id)).returning();
    return row;
  }
};
