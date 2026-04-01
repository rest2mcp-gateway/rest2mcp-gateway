import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { organizations, users } from "../../db/schema.js";

export const bootstrapLocalAdmin = async (app: FastifyInstance) => {
  const bootstrapAdminPassword = env.BOOTSTRAP_ADMIN_PASSWORD;

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
    where: eq(users.username, env.BOOTSTRAP_ADMIN_USERNAME)
  });

  if (!existingUser) {
    const passwordHash = await bcrypt.hash(bootstrapAdminPassword, 12);
    await app.db.insert(users).values({
      organizationId,
      username: env.BOOTSTRAP_ADMIN_USERNAME,
      name: env.BOOTSTRAP_ADMIN_NAME,
      role: "super_admin",
      authMode: "local",
      passwordHash,
      isActive: true
    });
    app.log.info({ username: env.BOOTSTRAP_ADMIN_USERNAME }, "bootstrapped local admin");
  }
};
