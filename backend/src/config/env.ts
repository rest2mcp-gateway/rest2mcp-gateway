import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentFilePath = fileURLToPath(import.meta.url);
const backendRootDir = resolve(dirname(currentFilePath), "../..");
export const repoRootDir = resolve(backendRootDir, "..");
export const defaultPgliteDataDir = resolve(repoRootDir, "data", "db");
const dotenvPath = process.env.DOTENV_CONFIG_PATH ?? resolve(repoRootDir, ".env");

loadEnv({ path: dotenvPath });

const parseOriginAllowlist = (value?: string) => {
  if (!value) {
    return [];
  }

  const entries = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(
    new Set(
      entries.map((entry) => {
        const normalized = new URL(entry).origin;
        if (normalized === "null") {
          throw new Error(`Invalid MCP_ALLOWED_ORIGINS entry: ${entry}`);
        }
        return normalized;
      })
    )
  );
};

export const rawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  DATABASE_PROVIDER: z.enum(["pglite", "postgres"]).default("pglite"),
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default(defaultPgliteDataDir),
  SECRET_ENCRYPTION_KEY: z.string().min(16),
  BOOTSTRAP_ORG_NAME: z.string().default("Default Organization"),
  BOOTSTRAP_ORG_SLUG: z.string().default("default"),
  BOOTSTRAP_ADMIN_USERNAME: z.string().min(1).default("admin"),
  BOOTSTRAP_ADMIN_NAME: z.string().default("Local Admin"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8)
});

const envSchema = rawEnvSchema.superRefine((value, ctx) => {
  if (value.DATABASE_PROVIDER === "postgres" && !value.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL is required when DATABASE_PROVIDER=postgres"
    });
  }
});

const envInput = {
  ...process.env,
  MCP_ALLOWED_ORIGINS: process.env.MCP_ALLOWED_ORIGINS,
  SECRET_ENCRYPTION_KEY:
    process.env.SECRET_ENCRYPTION_KEY ??
    (process.env.NODE_ENV === "test" ? "test-secret-encryption-key-1234567890" : undefined),
  BOOTSTRAP_ADMIN_PASSWORD:
    process.env.BOOTSTRAP_ADMIN_PASSWORD ??
    (process.env.NODE_ENV === "test" ? "test-password-123" : undefined),
  BOOTSTRAP_ADMIN_USERNAME:
    process.env.BOOTSTRAP_ADMIN_USERNAME ??
    (process.env.NODE_ENV === "test" ? "admin" : undefined)
};

export const env = {
  ...envSchema.parse(envInput),
  mcpAllowedOrigins: parseOriginAllowlist(envInput.MCP_ALLOWED_ORIGINS),
  startupWarnings: [] as string[]
};

export type Env = typeof env;
