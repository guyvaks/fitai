import { useLocation, useNavigate, NavLink, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Menu, Home, Zap, Sun, Moon } from "lucide-react";
import Avatar from "../Avatar";

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
      <h1 className="md:hidden text-base font-bold text-text-hi">{title}</h1>

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
