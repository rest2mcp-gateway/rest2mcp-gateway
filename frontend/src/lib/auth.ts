export const ACCESS_TOKEN_STORAGE_KEY = "rest-to-mcp.access-token";
export const USER_STORAGE_KEY = "rest-to-mcp.user";
export const UNAUTHORIZED_EVENT = "rest-to-mcp:unauthorized";

export type AuthUser = {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: "super_admin" | "admin" | "editor" | "viewer";
  authMode: "local" | "oidc";
  isActive: boolean;
};

export type StoredSession = {
  accessToken: string;
  user: AuthUser;
};

export const getStoredSession = (): StoredSession | null => {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);

  if (!accessToken || !rawUser) {
    return null;
  }

  try {
    const user = JSON.parse(rawUser) as AuthUser;
    return { accessToken, user };
  } catch {
    clearStoredSession();
    return null;
  }
};

export const setStoredSession = (session: StoredSession) => {
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, session.accessToken);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session.user));
};

export const clearStoredSession = () => {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
};

export const emitUnauthorizedEvent = () => {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
};
