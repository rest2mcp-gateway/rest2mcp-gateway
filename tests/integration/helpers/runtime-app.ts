import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { ZodEffects } from "zod";

type TestAppHandle = {
  app: FastifyInstance;
  dbRootDir: string;
  close: () => Promise<void>;
};

const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_PROVIDER: "pglite",
  SECRET_ENCRYPTION_KEY: "test-secret-encryption-key-1234567890",
  BOOTSTRAP_ORG_SLUG: "runtime-test-org",
  BOOTSTRAP_ADMIN_USERNAME: "admin",
  BOOTSTRAP_ADMIN_NAME: "Runtime Test Admin",
  BOOTSTRAP_ADMIN_PASSWORD: "test-password-123"
} as const;

const assignTestEnv = (dbRootDir: string, pgliteDataDir: string) => {
  Object.assign(process.env, TEST_ENV, {
    PGLITE_DATA_DIR: pgliteDataDir
  });

  return import("../../../src/config/env.js").then(({ env }) => {
    Object.assign(env, TEST_ENV, {
      PGLITE_DATA_DIR: pgliteDataDir,
      startupWarnings: []
    });

    return { env, dbRootDir };
  });
};

const installZodPartialShim = () => {
  const prototype = ZodEffects.prototype as ZodEffects & {
    partial?: () => unknown;
    innerType: () => { partial: () => unknown };
  };

  if (typeof prototype.partial === "function") {
    return;
  }

  prototype.partial = function partial() {
    return this.innerType().partial();
  };
};

export const createTestApp = async (): Promise<TestAppHandle> => {
  const dbRootDir = await mkdtemp(join(tmpdir(), "rest-to-mcp-runtime-test-"));
  const pgliteDataDir = join(dbRootDir, "db");
  await assignTestEnv(dbRootDir, pgliteDataDir);
  installZodPartialShim();

  const { buildApp } = await import("../../../src/app.js");
  const app = await buildApp();
  await app.ready();

  return {
    app,
    dbRootDir,
    close: async () => {
      await app.close();
      await rm(dbRootDir, { recursive: true, force: true });
    }
  };
};
