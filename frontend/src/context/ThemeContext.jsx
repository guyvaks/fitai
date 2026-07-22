import { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { profile } = useAuth();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("fitai_theme") || "dark"
  );

  // profile now comes from the single shared AuthProvider fetch, but it can
  // still resolve after the user has already toggled theme manually.
  // `settledRef` latches closed on whichever comes first — the profile sync
  // or a user-initiated toggle — so a late profile fetch never clobbers a
  // newer local toggle.
  const settledRef = useRef(false);

  useEffect(() => {
    if (settledRef.current) return;
    if (!profile?.theme_preference) return;
    settledRef.current = true;
    setTheme(profile.theme_preference);
  }, [profile]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("fitai_theme", theme);
  }, [theme]);

  const toggleTheme = async (newTheme) => {
    settledRef.current = true; // a user action always wins over any pending/stale profile fetch
    const previous = theme;
    setTheme(newTheme); // optimistic
    try {
      // TODO: this PUT doesn't update AuthContext's shared `profile` object —
      // profile.theme_preference stays stale after a toggle. Harmless today
      // (nothing re-reads it after mount), but if a future consumer reads
      // profile.theme_preference directly, it'll see the pre-toggle value.
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
