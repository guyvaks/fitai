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

  const login = useCallback(
    async (email, password) => {
      const res = await api.post("/api/v1/auth/login", { email, password });
      const { access_token } = res.data;
      localStorage.setItem("fitai_token", access_token);
      const meRes = await api.get("/api/v1/auth/me");
      localStorage.setItem("fitai_user", JSON.stringify(meRes.data));
      setUser(meRes.data);
      await fetchProfile();
      return meRes.data;
    },
    [fetchProfile]
  );

  const register = useCallback(
    async (email, password, fullName) => {
      const res = await api.post("/api/v1/auth/register", {
        email,
        password,
        full_name: fullName,
      });
      const { access_token } = res.data;
      localStorage.setItem("fitai_token", access_token);
      const meRes = await api.get("/api/v1/auth/me");
      localStorage.setItem("fitai_user", JSON.stringify(meRes.data));
      setUser(meRes.data);
      await fetchProfile();
      return meRes.data;
    },
    [fetchProfile]
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
        register,
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
