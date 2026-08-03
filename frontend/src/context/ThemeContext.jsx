import { createContext, useContext, useEffect, useRef, useState } from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";

const ThemeContext = createContext(null);

// Simple time-of-day thresholds for "auto" mode -- no geolocation/real
// sunrise-sunset, deliberately kept as two constants instead of a solar-
// position calculation.
const AUTO_LIGHT_START_HOUR = 6;
const AUTO_DARK_START_HOUR = 19;

function resolveAutoTheme() {
  const hour = new Date().getHours();
  return hour >= AUTO_LIGHT_START_HOUR && hour < AUTO_DARK_START_HOUR ? "light" : "dark";
}

function resolveTheme(preference) {
  return preference === "auto" ? resolveAutoTheme() : preference;
}

export function ThemeProvider({ children }) {
  const { profile } = useAuth();
  // themePreference is what the user chose ("light" | "dark" | "auto"),
  // persisted and shown as the Settings selection. resolvedTheme is what's
  // actually applied to data-theme -- equal to themePreference unless it's
  // "auto", in which case it's derived from the clock.
  const [themePreference, setThemePreferenceState] = useState(
    () => localStorage.getItem("fitai_theme") || "dark"
  );
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(themePreference));

  // profile now comes from the single shared AuthProvider fetch, but it can
  // still resolve after the user has already changed the preference manually.
  // `settledRef` latches closed on whichever comes first — the profile sync
  // or a user-initiated change — so a late profile fetch never clobbers a
  // newer local choice.
  const settledRef = useRef(false);

  useEffect(() => {
    if (settledRef.current) return;
    if (!profile?.theme_preference) return;
    settledRef.current = true;
    setThemePreferenceState(profile.theme_preference);
  }, [profile]);

  // Re-derive resolvedTheme whenever the preference changes, and — only for
  // "auto" — keep re-checking while the app stays open, so a long session
  // that crosses the 06:00/19:00 boundary switches live instead of only
  // resolving once on load. visibilitychange/focus match the re-check
  // pattern already used elsewhere in this app (e.g. Admin.jsx); the 5-minute
  // interval is a backstop for an uninterrupted foreground session.
  useEffect(() => {
    setResolvedTheme(resolveTheme(themePreference));
    if (themePreference !== "auto") return;

    const recheck = () => setResolvedTheme(resolveAutoTheme());
    const interval = setInterval(recheck, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    localStorage.setItem("fitai_theme", themePreference);
  }, [themePreference]);

  const setThemePreference = async (newPreference) => {
    settledRef.current = true; // a user action always wins over any pending/stale profile fetch
    const previous = themePreference;
    setThemePreferenceState(newPreference); // optimistic
    try {
      // TODO: this PUT doesn't update AuthContext's shared `profile` object —
      // profile.theme_preference stays stale after a change. Harmless today
      // (nothing re-reads it after mount), but if a future consumer reads
      // profile.theme_preference directly, it'll see the pre-change value.
      await api.put("/api/v1/users/profile", { theme_preference: newPreference });
    } catch {
      setThemePreferenceState(previous); // revert on failure
    }
  };

  return (
    <ThemeContext.Provider value={{ themePreference, resolvedTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
