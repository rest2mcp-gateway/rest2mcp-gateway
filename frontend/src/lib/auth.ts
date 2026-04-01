export const ACCESS_TOKEN_STORAGE_KEY = "rest-to-mcp.access-token";
export const USER_STORAGE_KEY = "rest-to-mcp.user";
export const ENV_CONFIG_STORAGE_KEY = "rest-to-mcp.env-config";
export const UNAUTHORIZED_EVENT = "rest-to-mcp:unauthorized";

export type AuthUser = {
  id: string;
  organizationId: string;
  username: string;
  name: string;
  role: "super_admin" | "admin" | "editor" | "viewer";
  authMode: "local" | "oidc";
  isActive: boolean;
};

export type EnvConfig = {
  autoPublishDrafts: boolean;
  mode: "development" | "test" | "production";
};

export type StoredSession = {
  accessToken: string;
  user: AuthUser;
  envConfig: EnvConfig;
};

export const getStoredSession = (): StoredSession | null => {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);
  const rawEnvConfig = localStorage.getItem(ENV_CONFIG_STORAGE_KEY);

  if (!accessToken || !rawUser || !rawEnvConfig) {
    return null;
  }

  try {
    const user = JSON.parse(rawUser) as AuthUser;
    const envConfig = JSON.parse(rawEnvConfig) as EnvConfig;
    return { accessToken, user, envConfig };
  } catch {
    clearStoredSession();
    return null;
  }
};

export const setStoredSession = (session: StoredSession) => {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, session.accessToken);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
  localStorage.setItem(ENV_CONFIG_STORAGE_KEY, JSON.stringify(session.envConfig));
};

export const clearStoredSession = () => {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(ENV_CONFIG_STORAGE_KEY);
};

export const emitUnauthorizedEvent = () => {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
};
