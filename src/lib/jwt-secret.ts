import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { appSettings } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

const JWT_SECRET_KEY = "admin.jwt_secret";

export const getOrCreateJwtSecret = async (app: FastifyInstance) => {
  const [existing] = await app.db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, JWT_SECRET_KEY))
    .limit(1);

  if (existing) {
    return decryptSecret(existing.encryptedValue);
  }

  const jwtSecret = randomBytes(32).toString("hex");
  const encryptedValue = encryptSecret(jwtSecret);

  await app.db.insert(appSettings).values({
    key: JWT_SECRET_KEY,
    encryptedValue
  });

  app.log.info("generated and persisted admin JWT signing secret");
  return jwtSecret;
};
