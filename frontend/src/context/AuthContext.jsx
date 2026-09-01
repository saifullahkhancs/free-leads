import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // True when a logged-in session could no longer be silently refreshed —
  // drives the "session expired, log in again" popup card.
  const [sessionExpired, setSessionExpired] = useState(false);

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

  // The API client fires this event when a refresh fails for a previously
  // active session. Keep `user` set (so the page underneath does not unmount
  // or redirect) and surface the re-login modal instead.
  useEffect(() => {
    const onSessionExpired = () => {
      setUser((current) => {
        if (current) setSessionExpired(true);
        return current;
      });
    };
    window.addEventListener(api.SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(api.SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    await api.login(email, password);
    const profile = await api.getCurrentUser();
    setUser(profile);
    setSessionExpired(false);
    return profile;
  }, []);

  /**
   * Log back in from the session-expired modal. If a *different* account is
   * used, do a hard reload so no stale per-user state (quota, role-gated UI,
   * cached lists) leaks across accounts.
   */
  const reauthenticate = useCallback(async (email, password) => {
    const previousUserId = user?.id || null;
    await api.login(email, password);
    const profile = await api.getCurrentUser();
    if (previousUserId && profile?.id !== previousUserId) {
      window.location.reload();
      return profile;
    }
    setUser(profile);
    setSessionExpired(false);
    return profile;
  }, [user?.id]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setSessionExpired(false);
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
      sessionExpired,
      login,
      reauthenticate,
      logout,
      refreshUser,
      hasRole,
      hasPermission,
      setUser,
    }),
    [user, isLoading, sessionExpired, login, reauthenticate, logout, refreshUser, hasRole, hasPermission, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
