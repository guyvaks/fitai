import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/users/profile");
      setProfile(data);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("fitai_user");
    const token = localStorage.getItem("fitai_token");
    if (stored && token) {
      setUser(JSON.parse(stored));
      fetchProfile();
    }
    setLoading(false);
  }, [fetchProfile]);

  // Shared by login() and the post-verify-email flow (VerifyEmail.jsx) --
  // both end with "we have a fresh access_token, establish the session from
  // it." Registration deliberately does NOT go through this: an unverified
  // account must not have a working client-side session (see Register.jsx),
  // only login (blocked server-side until verified) and a successful
  // /verify-email produce a session.
  const establishSession = useCallback(
    async (access_token) => {
      localStorage.setItem("fitai_token", access_token);
      const meRes = await api.get("/api/v1/auth/me");
      localStorage.setItem("fitai_user", JSON.stringify(meRes.data));
      setUser(meRes.data);
      await fetchProfile();
      return meRes.data;
    },
    [fetchProfile]
  );

  const login = useCallback(
    async (username, password) => {
      const res = await api.post("/api/v1/auth/login", { username, password });
      return establishSession(res.data.access_token);
    },
    [establishSession]
  );

  const loginWithToken = useCallback(
    (access_token) => establishSession(access_token),
    [establishSession]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("fitai_token");
    localStorage.removeItem("fitai_user");
    setUser(null);
    setProfile(null);
  }, []);

  // Merges partial fields (e.g. avatar_updated_at after an upload) into the
  // shared user object so every consumer re-renders with the new value
  // immediately, without a full page reload.
  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem("fitai_user", JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAuthenticated: !!user,
        login,
        loginWithToken,
        logout,
        fetchProfile,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
