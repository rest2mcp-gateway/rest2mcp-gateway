import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { users } from "../../db/schema.js";
import { listEntities } from "../common/crud.js";

type UserWriteInput = {
  organizationId: string;
  username: string;
  name: string;
  role: "super_admin" | "admin" | "editor" | "viewer";
  authMode: "local" | "oidc";
  isActive?: boolean | undefined;
  password?: string | undefined;
};

type UserUpdateInput = {
  username?: string | undefined;
  name?: string | undefined;
  role?: "super_admin" | "admin" | "editor" | "viewer" | undefined;
  authMode?: "local" | "oidc" | undefined;
  isActive?: boolean | undefined;
  password?: string | undefined;
};

export const userRepository = {
  list: (app: FastifyInstance, query: { organizationId?: string | undefined; page: number; pageSize: number; search?: string | undefined; isActive?: boolean | undefined }) =>
    listEntities(app, users, { ...query, searchColumn: "username" }),
  create: async (app: FastifyInstance, values: UserWriteInput) => {
    const passwordHash = values.password ? await bcrypt.hash(values.password, 12) : null;
    const [row] = await app.db.insert(users).values({
      organizationId: values.organizationId,
      username: values.username,
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
  update: async (app: FastifyInstance, id: string, values: UserUpdateInput) => {
    const passwordHash = values.password ? await bcrypt.hash(values.password, 12) : undefined;
    const [row] = await app.db.update(users).set({
      username: values.username,
      name: values.name,
      role: values.role,
      authMode: values.authMode,
      isActive: values.isActive,
      passwordHash
    }).where(eq(users.id, id)).returning();
    return row;
  }
};
