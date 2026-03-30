import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { organizations, users } from "../../db/schema.js";

export const bootstrapLocalAdmin = async (app: FastifyInstance) => {
  if (env.AUTH_MODE !== "local") {
    return;
  }
  const bootstrapAdminPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!bootstrapAdminPassword) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be configured when AUTH_MODE=local");
  }

  const existingOrg = await app.db.query.organizations.findFirst({
    where: eq(organizations.slug, env.BOOTSTRAP_ORG_SLUG)
  });

  const organizationId = existingOrg?.id ?? randomUUID();

  if (!existingOrg) {
    await app.db.insert(organizations).values({
      id: organizationId,
      name: env.BOOTSTRAP_ORG_NAME,
      slug: env.BOOTSTRAP_ORG_SLUG
    });
  }

  const existingUser = await app.db.query.users.findFirst({
    where: eq(users.email, env.BOOTSTRAP_ADMIN_EMAIL)
  });

  if (!existingUser) {
    const passwordHash = await bcrypt.hash(bootstrapAdminPassword, 12);
    await app.db.insert(users).values({
      organizationId,
      email: env.BOOTSTRAP_ADMIN_EMAIL,
      name: env.BOOTSTRAP_ADMIN_NAME,
      role: "super_admin",
      authMode: "local",
      passwordHash,
      isActive: true
    });
    app.log.info({ email: env.BOOTSTRAP_ADMIN_EMAIL }, "bootstrapped local admin");
  }
};
