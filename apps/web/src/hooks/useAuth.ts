"use client";
import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { api } from "@/lib/api";
import { getToken, setToken, removeToken } from "@/lib/auth";
import type { AuthUser, Organization } from "@dosarfonduri/shared";

interface AuthState {
  user: AuthUser | null;
  organization: Organization | null;
  loading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<{ hasOrganization: boolean }>;
  signup: (data: { name: string; email: string; password: string; cabinetCode?: string; cui?: string }) => Promise<{ hasOrganization: boolean }>;
  logout: () => void;
  refresh: () => Promise<void>;
}

export type AuthContextType = AuthState & AuthActions;

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthState(): AuthContextType {
  const [state, setState] = useState<AuthState>({
    user: null,
    organization: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setState({ user: null, organization: null, loading: false, error: null });
      return;
    }
    try {
      const data = await api("/api/auth/me", { token });
      setState({
        user: data.user,
        organization: data.organization,
        loading: false,
        error: null,
      });
    } catch {
      removeToken();
      setState({ user: null, organization: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      setState({
        user: data.user,
        organization: null,
        loading: false,
        error: null,
      });
      if (data.hasOrganization) {
        await refresh();
      }
      return { hasOrganization: data.hasOrganization };
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }, [refresh]);

  const signup = useCallback(async (data: { name: string; email: string; password: string; cabinetCode?: string; cui?: string }) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setToken(res.token);
      setState({
        user: res.user,
        organization: res.organization || null,
        loading: false,
        error: null,
      });
      return { hasOrganization: res.hasOrganization };
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setState({ user: null, organization: null, loading: false, error: null });
  }, []);

  return { ...state, login, signup, logout, refresh };
}
