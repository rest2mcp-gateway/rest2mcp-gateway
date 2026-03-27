import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { users } from "../../db/schema.js";

export const authRepository = {
  findByEmail: (app: FastifyInstance, email: string) =>
    app.db.query.users.findFirst({
      where: eq(users.email, email)
    }),
  findById: (app: FastifyInstance, id: string) =>
    app.db.query.users.findFirst({
      where: eq(users.id, id)
    })
};
