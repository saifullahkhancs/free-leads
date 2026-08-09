import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restoredUser = await api.trySilentLogin();
      if (!cancelled) {
        setUser(restoredUser);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    await api.login(email, password);
    const profile = await api.getCurrentUser();
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const profile = await api.getCurrentUser();
    setUser(profile);
    return profile;
  }, []);

  const hasRole = useCallback(
    (...roles) => Boolean(user && user.roles?.some((r) => roles.includes(r))),
    [user]
  );

  const hasPermission = useCallback(
    (...permissions) =>
      Boolean(user && permissions.every((p) => user.permissions?.includes(p))),
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
      refreshUser,
      hasRole,
      hasPermission,
    }),
    [user, isLoading, login, logout, refreshUser, hasRole, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
