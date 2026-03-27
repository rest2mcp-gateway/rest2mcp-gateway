import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import "dotenv/config";
import { z } from "zod";

const createEphemeralSecret = () => randomBytes(32).toString("hex");
const createPersistentSecret = () => randomBytes(32).toString("hex");
const createPersistentPassword = () => randomBytes(12).toString("base64url");

const resolveDevSecretFilePath = (pgliteDataDir: string) =>
  resolve(dirname(resolve(pgliteDataDir)), "dev-secrets.json");

const loadOrCreateDevLocalState = (pgliteDataDir: string) => {
  const secretFilePath = resolveDevSecretFilePath(pgliteDataDir);

  if (existsSync(secretFilePath)) {
    const raw = readFileSync(secretFilePath, "utf8");
    const parsed = z.object({
      secretEncryptionKey: z.string().min(16).optional(),
      bootstrapAdminPassword: z.string().min(8).optional()
    }).parse(JSON.parse(raw));

    let mutated = false;
    let createdSecretEncryptionKey = false;
    let createdBootstrapAdminPassword = false;
    const next = { ...parsed };

    if (!next.secretEncryptionKey) {
      next.secretEncryptionKey = createPersistentSecret();
      mutated = true;
      createdSecretEncryptionKey = true;
    }

    if (!next.bootstrapAdminPassword) {
      next.bootstrapAdminPassword = createPersistentPassword();
      mutated = true;
      createdBootstrapAdminPassword = true;
    }

    if (mutated) {
      writeFileSync(secretFilePath, JSON.stringify(next, null, 2), {
        encoding: "utf8",
        mode: 0o600
      });
    }

    return {
      secretEncryptionKey: next.secretEncryptionKey,
      bootstrapAdminPassword: next.bootstrapAdminPassword,
      secretFilePath,
      createdSecretEncryptionKey,
      createdBootstrapAdminPassword
    };
  }

  mkdirSync(dirname(secretFilePath), { recursive: true });
  const secretEncryptionKey = createPersistentSecret();
  const bootstrapAdminPassword = createPersistentPassword();
  writeFileSync(secretFilePath, JSON.stringify({ secretEncryptionKey, bootstrapAdminPassword }, null, 2), {
    encoding: "utf8",
    mode: 0o600
  });

  return {
    secretEncryptionKey,
    bootstrapAdminPassword,
    secretFilePath,
    createdSecretEncryptionKey: true,
    createdBootstrapAdminPassword: true
  };
};

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_PROVIDER: z.enum(["pglite", "postgres"]).default("pglite"),
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default("./data/db"),
  JWT_SECRET: z.string().optional(),
  SECRET_ENCRYPTION_KEY: z.string().optional(),
  AUTH_MODE: z.enum(["local", "oidc"]).default("local"),
  BOOTSTRAP_ORG_NAME: z.string().default("Default Organization"),
  BOOTSTRAP_ORG_SLUG: z.string().default("default"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  BOOTSTRAP_ADMIN_NAME: z.string().default("Local Admin"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8).optional()
});

const withDefaults = rawEnvSchema.transform((value) => {
  const warnings: string[] = [];
  const isProduction = value.NODE_ENV === "production";
  const isLocalLike = !isProduction;
  const persistedDevState =
    isLocalLike && (!value.SECRET_ENCRYPTION_KEY || (value.AUTH_MODE === "local" && !value.BOOTSTRAP_ADMIN_PASSWORD))
    ? loadOrCreateDevLocalState(value.PGLITE_DATA_DIR)
    : null;

  const jwtSecret = value.JWT_SECRET ?? (isLocalLike ? createEphemeralSecret() : undefined);
  const secretEncryptionKey = value.SECRET_ENCRYPTION_KEY ?? persistedDevState?.secretEncryptionKey;
  const bootstrapAdminPassword =
    value.AUTH_MODE === "local"
      ? (value.BOOTSTRAP_ADMIN_PASSWORD ?? persistedDevState?.bootstrapAdminPassword)
      : undefined;

  if (!value.JWT_SECRET && isLocalLike) {
    warnings.push("JWT_SECRET not set; using an ephemeral development secret");
  }
  if (!value.SECRET_ENCRYPTION_KEY && persistedDevState?.createdSecretEncryptionKey) {
    warnings.push(`SECRET_ENCRYPTION_KEY not set; generated and saved a local development key at ${persistedDevState.secretFilePath}`);
  }
  if (!value.SECRET_ENCRYPTION_KEY && persistedDevState && !persistedDevState.createdSecretEncryptionKey) {
    warnings.push(`SECRET_ENCRYPTION_KEY not set; loaded local development key from ${persistedDevState.secretFilePath}`);
  }
  if (value.AUTH_MODE === "local" && !value.BOOTSTRAP_ADMIN_PASSWORD && persistedDevState?.createdBootstrapAdminPassword) {
    warnings.push(`BOOTSTRAP_ADMIN_PASSWORD not set; generated and saved a local development admin password at ${persistedDevState.secretFilePath}`);
  }
  if (value.AUTH_MODE === "local" && !value.BOOTSTRAP_ADMIN_PASSWORD && persistedDevState && !persistedDevState.createdBootstrapAdminPassword) {
    warnings.push(`BOOTSTRAP_ADMIN_PASSWORD not set; loaded local development admin password from ${persistedDevState.secretFilePath}`);
  }

  return {
    ...value,
    JWT_SECRET: jwtSecret,
    SECRET_ENCRYPTION_KEY: secretEncryptionKey,
    BOOTSTRAP_ADMIN_PASSWORD: bootstrapAdminPassword,
    startupWarnings: warnings
  };
});

const envSchema = withDefaults.superRefine((value, ctx) => {
  if (value.DATABASE_PROVIDER === "postgres" && !value.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL is required when DATABASE_PROVIDER=postgres"
    });
  }
  if (!value.JWT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["JWT_SECRET"],
      message: "JWT_SECRET is required in production"
    });
  }
  if (!value.SECRET_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SECRET_ENCRYPTION_KEY"],
      message: "SECRET_ENCRYPTION_KEY is required in production"
    });
  }
  if (value.AUTH_MODE === "local" && !value.BOOTSTRAP_ADMIN_PASSWORD) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BOOTSTRAP_ADMIN_PASSWORD"],
      message: "BOOTSTRAP_ADMIN_PASSWORD is required when AUTH_MODE=local"
    });
  }
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
