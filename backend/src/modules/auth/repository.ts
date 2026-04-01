import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { users } from "../../db/schema.js";

export const authRepository = {
  findByUsername: (app: FastifyInstance, username: string) =>
    app.db.query.users.findFirst({
      where: eq(users.username, username)
    }),
  findById: (app: FastifyInstance, id: string) =>
    app.db.query.users.findFirst({
      where: eq(users.id, id)
    })
};
