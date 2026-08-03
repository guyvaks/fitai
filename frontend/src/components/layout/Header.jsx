import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, NavLink, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Menu, Home, Sun, Moon, Bell, ChevronDown, Settings as SettingsIcon, LogOut } from "lucide-react";
import Avatar from "../Avatar";
import api from "../../services/api";
import { PENDING_COUNT_CHANGED_EVENT } from "../../utils/pendingUpdates";

const pageTitles = {
  "/dashboard": "ראשי",
  "/profile": "פרופיל",
  "/metrics": "ניתוח מדדים",
  "/nutrition": "תזונה",
  "/calorie-calculator": "מחשבון קלוריות",
  "/workouts": "אימונים",
  "/live-workout": "אימון חי",
  "/progress": "התקדמות",
  "/ai-suggestion": "הצעות AI",
  "/admin": "ניהול משתמשים",
};

export default function Header({ onToggleSidebar }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { resolvedTheme, setThemePreference } = useTheme();
  const title = pageTitles[location.pathname] || "FitAI";
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingExerciseCount, setPendingExerciseCount] = useState(0);
  const [pendingFoodCount, setPendingFoodCount] = useState(0);
  const [pendingAiAccessCount, setPendingAiAccessCount] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen]);

  // Closes the menu on navigation (e.g. after clicking "Account & Settings"
  // the route changes, but a raw Link click doesn't otherwise reset local state).
  useEffect(() => {
    setAccountMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  useEffect(() => {
    if (!user?.is_admin) return;

    const fetchPendingCounts = () => {
      Promise.all([
        api.get("/api/v1/admin/exercises/pending"),
        api.get("/api/v1/admin/food-master/pending"),
        // No dedicated "pending AI access" endpoint exists -- GET /users
        // already returns ai_access_approved for everyone, so counting
        // client-side avoids adding a new backend endpoint for this.
        api.get("/api/v1/admin/users"),
      ])
        .then(([ex, foods, users]) => {
          const aiAccessCount = users.data.filter((u) => !u.ai_access_approved).length;
          setPendingExerciseCount(ex.data.length);
          setPendingFoodCount(foods.data.length);
          setPendingAiAccessCount(aiAccessCount);
          setPendingCount(ex.data.length + foods.data.length + aiAccessCount);
        })
        .catch(() => {});
    };

    fetchPendingCounts();
    window.addEventListener(PENDING_COUNT_CHANGED_EVENT, fetchPendingCounts);
    return () => window.removeEventListener(PENDING_COUNT_CHANGED_EVENT, fetchPendingCounts);
  }, [user?.is_admin]);

  const bellTarget = pendingFoodCount > 0
    ? "/admin?tab=foods"
    : pendingExerciseCount > 0
      ? "/admin?tab=exercises"
      : pendingAiAccessCount > 0
        ? "/admin?tab=users"
        : "/admin";

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-line flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
      {/* Mobile hamburger + logo */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          className="md:hidden text-text-mid hover:text-text-hi p-2 -mr-2 transition-colors"
          onClick={onToggleSidebar}
          aria-label="תפריט"
        >
          <Menu className="w-6 h-6" />
        </button>
        {/* Account dropdown -- md:hidden here matches the rest of this cluster,
            but note md: never actually activates in this app (breakpoints
            neutralized to 9999px in index.css for the mobile-only frame), so
            this is effectively always rendered; it's just following the same
            convention as its siblings. */}
        <div className="relative md:hidden shrink-0" ref={accountMenuRef}>
          <button
            type="button"
            onClick={() => setAccountMenuOpen((o) => !o)}
            className="flex items-center gap-1 shrink-0"
            title="החשבון שלי"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
          >
            <Avatar user={user} className="w-7 h-7 text-[10px] shrink-0" />
            <ChevronDown
              className={`w-3.5 h-3.5 text-text-mid transition-transform ${accountMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          {accountMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-64 rounded-[var(--radius-card)] border border-line-strong bg-surface-2/95 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.35)] overflow-hidden z-30 anim-rise"
            >
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold tracking-wider text-text-low uppercase">מחובר/ת כ</p>
                <div className="flex items-center gap-3 mt-2">
                  <Avatar user={user} className="w-10 h-10 text-sm shrink-0" />
                  <div className="min-w-0">
                    <p className="text-text-hi font-bold text-sm truncate">{user?.full_name}</p>
                    {user?.username && (
                      <span
                        className="inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-soft text-violet"
                        dir="auto"
                      >
                        {user.username}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-line" />

              <Link
                to="/settings"
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-3 bg-violet-soft text-violet font-bold text-sm hover:brightness-110 transition"
              >
                <SettingsIcon className="w-4 h-4 shrink-0" />
                חשבון והגדרות
              </Link>

              <div className="border-t border-line" />

              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-coral font-bold text-sm hover:bg-coral-soft transition"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                התנתקות
              </button>
            </div>
          )}
        </div>
        <h1 className="hidden md:block text-lg font-bold text-text-hi">{title}</h1>
      </div>

      {/* Mobile: page title — flexible middle region. The FitAI wordmark
          used to live here too (duplicating the one in Sidebar's header),
          which left too little width for longer titles like "ניהול
          משתמשים" or "הצעות AI" and truncated them; dropping it gives the
          title the full remaining width instead. */}
      <h1 className="md:hidden flex-1 min-w-0 text-sm font-bold text-text-hi flex items-center justify-center gap-1.5 truncate px-2">
        <span className="truncate">{title}</span>
      </h1>

      {/* Right cluster */}
      <div className="flex items-center gap-1 md:gap-3 shrink-0">
        {/* Theme toggle — always visible */}
        {/* Explicit manual override -- always sets a concrete light/dark
            preference (never "auto"), even if the current preference was
            auto, matching Settings' rule that a manual choice takes priority. */}
        <button
          onClick={() => setThemePreference(resolvedTheme === "dark" ? "light" : "dark")}
          className="text-text-mid hover:text-volt p-2 rounded-elem hover:bg-white/5 transition-colors"
          title={resolvedTheme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
          aria-label={resolvedTheme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
        >
          {resolvedTheme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* WhatsApp contact — visible to everyone, always in this slot so the
            row doesn't reflow between admin/non-admin views; the admin-only
            Bell (if present) is inserted directly after it, never before. */}
        <a
          href={`https://wa.me/972547779795?text=${encodeURIComponent("שלום, יש לי שאלה על FitAI")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-7 h-7 rounded-full flex items-center justify-center hover:brightness-110 active:scale-95 transition"
          style={{ backgroundColor: "#25D366" }}
          title="צור קשר בוואטסאפ"
          aria-label="צור קשר בוואטסאפ"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12.004 2C6.486 2 2.01 6.477 2.01 11.994c0 2.09.635 4.028 1.72 5.638L2 22l4.484-1.677a9.94 9.94 0 0 0 5.52 1.665h.001c5.517 0 9.994-4.476 9.994-9.994C21.999 6.477 17.522 2 12.004 2zm0 18.03a8.02 8.02 0 0 1-4.086-1.117l-.293-.174-3.023 1.13.99-2.947-.192-.303a8.014 8.014 0 0 1-1.24-4.625c0-4.418 3.594-8.013 8.013-8.013 4.418 0 8.013 3.595 8.013 8.013 0 4.419-3.595 8.036-8.182 8.036z" />
          </svg>
        </a>

        {/* Admin notification bell — pending exercises/foods, admin only */}
        {user?.is_admin && (
          <Link
            to={bellTarget}
            className="relative text-text-mid hover:text-volt p-2 rounded-elem hover:bg-white/5 transition-colors"
            title="ממתינים לאישור"
            aria-label="ממתינים לאישור"
          >
            <Bell className="w-5 h-5" />
            {pendingCount > 0 && (
              <span className="absolute top-0.5 left-0.5 bg-coral text-white text-[10px] rounded-full px-1.5 py-0.5">{pendingCount}</span>
            )}
          </Link>
        )}

        {/* Desktop: user info — links to profile */}
        <NavLink
          to="/profile"
          className="hidden md:flex items-center gap-3 rounded-full px-2 py-1 hover:bg-white/5 transition-colors"
          title="הפרופיל שלי"
        >
          <span className="text-text-mid text-sm hover:text-text-hi transition-colors">{user?.full_name}</span>
          <Avatar user={user} className="w-8 h-8 text-xs" />
        </NavLink>

        {/* Mobile: home button */}
        <button
          className="md:hidden text-text-mid hover:text-volt p-2 transition-colors"
          onClick={() => navigate('/dashboard')}
          aria-label="בית"
        >
          <Home className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
