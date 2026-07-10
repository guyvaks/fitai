import { useState, useEffect, useCallback } from "react";
import api from "../services/api";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get("/api/v1/users/profile");
      setProfile(data);
      if (data?.theme_preference) {
        // useAuth() has no shared context — each caller gets independent state,
        // so ThemeProvider (mounted once, separately) can't observe this
        // instance's `profile` update directly. Broadcast the value via a
        // custom event instead; ThemeProvider alone decides whether to accept
        // it (it may be stale relative to a more recent user toggle) and is
        // the only thing that writes localStorage["fitai_theme"].
        window.dispatchEvent(
          new CustomEvent("fitai-theme-sync", { detail: data.theme_preference })
        );
      }
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

  return {
    user,
    profile,
    loading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    fetchProfile,
  };
}
