import type { AuthUser, EnvConfig, StoredSession } from "@/lib/auth";

export const buildAuthUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: "user-1",
  organizationId: "org-1",
  username: "admin",
  name: "Admin User",
  role: "admin",
  authMode: "local",
  isActive: true,
  ...overrides
});

export const buildEnvConfig = (overrides: Partial<EnvConfig> = {}): EnvConfig => ({
  autoPublishDrafts: false,
  mode: "development",
  ...overrides
});

export const buildStoredSession = (overrides: Partial<StoredSession> = {}): StoredSession => ({
  accessToken: "test-access-token",
  user: buildAuthUser(),
  envConfig: buildEnvConfig(),
  ...overrides
});
