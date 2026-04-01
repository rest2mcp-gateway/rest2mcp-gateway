import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import fp from "fastify-plugin";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { ensurePgliteSchema } from "./pglite-bootstrap.js";
import * as schema from "./schema.js";

export type DatabaseProvider = "postgres" | "pglite";
export type AppDatabase = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;
type OptionalPool = Pool | undefined;
type OptionalPGlite = PGlite | undefined;

declare module "fastify" {
  interface FastifyInstance {
    db: AppDatabase;
    dbProvider: DatabaseProvider;
    pg: OptionalPool;
    pglite: OptionalPGlite;
  }
}

type BootstrapResult =
  | { db: NodePgDatabase<typeof schema>; provider: "postgres"; pg: Pool }
  | { db: PgliteDatabase<typeof schema>; provider: "pglite"; pglite: PGlite; initialized: boolean };

const createPostgresDb = () => {
  const pool = new Pool({
    connectionString: env.DATABASE_URL
  });

  return {
    db: drizzle(pool, { schema }),
    provider: "postgres" as const,
    pg: pool
  };
};

const createPgliteDb = async () => {
  const dataDir = resolve(env.PGLITE_DATA_DIR);
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const initialized = await ensurePgliteSchema(client);

  return {
    db: drizzlePglite(client, { schema }),
    provider: "pglite" as const,
    pglite: client,
    initialized
  };
};

export const createDatabase = async (): Promise<BootstrapResult> => {
  if (env.DATABASE_PROVIDER === "postgres") {
    return createPostgresDb();
  }

  return createPgliteDb();
};

export const registerDb = fp(async (app) => {
  const decorate = (property: string, value: unknown) =>
    (app.decorate as (this: typeof app, property: string, value: unknown) => void).call(app, property, value);

  app.log.info({ provider: env.DATABASE_PROVIDER }, "initializing database provider");
  app.log.debug({
    provider: env.DATABASE_PROVIDER,
    databaseUrlConfigured: Boolean(env.DATABASE_URL),
    pgliteDataDir: env.PGLITE_DATA_DIR
  }, "database configuration");

  const database = await createDatabase();

  decorate("db", database.db);
  decorate("dbProvider", database.provider);

  if (database.provider === "postgres") {
    decorate("pg", database.pg);
    app.log.info("database provider ready: postgres");
  } else {
    decorate("pglite", database.pglite);
    if (database.initialized) {
      app.log.info({ dataDir: resolve(env.PGLITE_DATA_DIR) }, "pglite schema initialized");
    } else {
      app.log.debug({ dataDir: resolve(env.PGLITE_DATA_DIR) }, "pglite schema already present");
    }
    app.log.info({ dataDir: resolve(env.PGLITE_DATA_DIR) }, "database provider ready: pglite");
  }

  app.addHook("onClose", async () => {
    app.log.debug({ provider: database.provider }, "closing database provider");
    if (database.provider === "postgres") {
      await database.pg.end();
      return;
    }

    await database.pglite.close();
  });
});
