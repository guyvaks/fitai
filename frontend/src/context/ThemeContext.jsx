import { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../services/api";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("fitai_theme") || "dark"
  );

  // Several independent components (Header, Sidebar, Dashboard, ProtectedRoute)
  // each call useAuth() on mount and each fires its own GET /users/profile —
  // amplified further by React StrictMode's double-invoke in dev. Several of
  // these can still be in flight when the user toggles theme; a late, stale
  // response must not clobber a newer local toggle. `settledRef` latches
  // closed on whichever comes first — the first genuine profile sync, or a
  // user-initiated toggle — so only one of them ever gets to set the initial
  // value, and no stale in-flight fetch can override it afterward.
  const settledRef = useRef(false);

  // useAuth() has no shared context — each caller (Login, Sidebar, ThemeProvider
  // itself, etc.) gets independent state, so ThemeProvider can't read another
  // instance's fetched `profile` reactively. useAuth's fetchProfile broadcasts
  // this event whenever it resolves theme_preference; listen for it instead.
  useEffect(() => {
    const sync = (event) => {
      if (settledRef.current) return;
      settledRef.current = true;
      if (event.detail) setTheme(event.detail);
    };
    window.addEventListener("fitai-theme-sync", sync);
    return () => window.removeEventListener("fitai-theme-sync", sync);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fitai_theme", theme);
  }, [theme]);

  const toggleTheme = async (newTheme) => {
    settledRef.current = true; // a user action always wins over any pending/stale profile fetch
    const previous = theme;
    setTheme(newTheme); // optimistic
    try {
      await api.put("/api/v1/users/profile", { theme_preference: newTheme });
    } catch {
      setTheme(previous); // revert on failure
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
