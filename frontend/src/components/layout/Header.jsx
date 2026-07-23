import { useEffect, useState } from "react";
import { useLocation, useNavigate, NavLink, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Menu, Home, Zap, Sun, Moon, Bell } from "lucide-react";
import Avatar from "../Avatar";
import api from "../../services/api";

const pageTitles = {
  "/dashboard": "ראשי",
  "/profile": "פרופיל",
  "/metrics": "ניתוח מדדים",
  "/nutrition": "תזונה",
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
  const { theme, toggleTheme } = useTheme();
  const title = pageTitles[location.pathname] || "FitAI";
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingExerciseCount, setPendingExerciseCount] = useState(0);
  const [pendingFoodCount, setPendingFoodCount] = useState(0);

  useEffect(() => {
    if (!user?.is_admin) return;
    Promise.all([
      api.get("/api/v1/admin/exercises/pending"),
      api.get("/api/v1/admin/food-master/pending"),
    ])
      .then(([ex, foods]) => {
        setPendingExerciseCount(ex.data.length);
        setPendingFoodCount(foods.data.length);
        setPendingCount(ex.data.length + foods.data.length);
      })
      .catch(() => {});
  }, [user?.is_admin]);

  const bellTarget = pendingFoodCount > 0
    ? "/admin?tab=foods"
    : pendingExerciseCount > 0
      ? "/admin?tab=exercises"
      : "/admin";

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-line flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
      {/* Mobile hamburger + logo */}
      <div className="flex items-center gap-3">
        <button
          className="md:hidden text-text-mid hover:text-text-hi p-2 -mr-2 transition-colors"
          onClick={onToggleSidebar}
          aria-label="תפריט"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Link to="/profile" className="md:hidden" title="הפרופיל שלי">
          <Avatar user={user} className="w-7 h-7 text-[10px]" />
        </Link>
        <span className="md:hidden text-xl font-extrabold text-text-hi tracking-tight flex items-center gap-1.5">
          <span className="w-6 h-6 rounded-lg bg-volt flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-ink" fill="currentColor" strokeWidth={0} />
          </span>
          <span dir="ltr">Fit<span className="text-volt">AI</span></span>
        </span>
        <h1 className="hidden md:block text-lg font-bold text-text-hi">{title}</h1>
      </div>

      {/* Mobile: page title */}
      <h1 className="md:hidden text-base font-bold text-text-hi flex items-center gap-1.5">
        {title}
      </h1>

      {/* Right cluster */}
      <div className="flex items-center gap-1 md:gap-3">
        {/* Theme toggle — always visible */}
        <button
          onClick={() => toggleTheme(theme === "dark" ? "light" : "dark")}
          className="text-text-mid hover:text-volt p-2 rounded-elem hover:bg-white/5 transition-colors"
          title={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
          aria-label={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
        >
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
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
