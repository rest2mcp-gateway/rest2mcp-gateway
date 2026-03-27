import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  UNAUTHORIZED_EVENT,
  type AuthUser
} from "@/lib/auth";
import { authApi } from "@/services/api-client";

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(() => getStoredSession());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredSession();
      setSession(null);
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    accessToken: session?.accessToken ?? null,
    user: session?.user ?? null,
    isAuthenticated: Boolean(session?.accessToken),
    isLoading,
    login: async (email: string, password: string) => {
      setIsLoading(true);
      try {
        const result = await authApi.login(email, password);
        const nextSession = {
          accessToken: result.token,
          user: result.user
        };
        setStoredSession(nextSession);
        setSession(nextSession);
      } finally {
        setIsLoading(false);
      }
    },
    logout: () => {
      clearStoredSession();
      setSession(null);
    }
  }), [isLoading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
