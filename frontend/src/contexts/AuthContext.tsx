import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from '../lib/api';
import { API_PATHS } from '../lib/apiPaths';
import type { User } from '../lib/types';

type LoginPayload  = { email: string; password: string };
type RegisterPayload = {
  email: string;
  password: string;
  password_confirmation: string;
  first_name: string;
  last_name: string;
  display_name: string;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<User>(API_PATHS.auth.me);
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  // Load current user on mount
  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const login = useCallback(async (data: LoginPayload) => {
    await api.post(API_PATHS.auth.login, data);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post(API_PATHS.auth.logout);
    setUser(null);
  }, []);

  const register = useCallback(async (data: RegisterPayload) => {
    await api.post(API_PATHS.auth.register, data);
    // After registration Django sends a verification email; don't auto-login.
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, register, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
