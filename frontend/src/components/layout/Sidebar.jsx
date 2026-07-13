import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../context/ThemeContext";
import {
  LayoutDashboard,
  User,
  Salad,
  Dumbbell,
  Play,
  TrendingUp,
  Bot,
  Settings,
  LogOut,
  Zap,
  Crown,
  Calculator,
  Sun,
  Moon,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "דשבורד", Icon: LayoutDashboard },
  { to: "/profile", label: "פרופיל", Icon: User },
  { to: "/nutrition", label: "תזונה", Icon: Salad },
  { to: "/calorie-calculator", label: "מחשבון קלוריות", Icon: Calculator },
  { to: "/workouts", label: "אימונים", Icon: Dumbbell },
  { to: "/live-workout", label: "אימון חי", Icon: Play },
  { to: "/progress", label: "התקדמות", Icon: TrendingUp },
  { to: "/ai-suggestion", label: "הצעות AI", Icon: Bot },
];

const adminItems = [
  { to: "/admin", label: "ניהול משתמשים", Icon: Settings },
];

function NavItem({ to, label, Icon, onClose }) {
  return (
    <NavLink
      to={to}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-elem text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-volt-soft text-volt border border-volt/25 shadow-[0_0_18px_rgba(163,230,53,0.12)]"
            : "text-text-mid border border-transparent hover:bg-white/5 hover:text-text-hi"
        }`
      }
    >
      <Icon className="w-4.5 h-4.5" strokeWidth={2} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ onClose }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    localStorage.clear()
    window.location.href = '/login'
  }

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="flex flex-col h-full bg-surface/95 backdrop-blur-xl border-l border-line">
      {/* Logo */}
      <div className="p-6 border-b border-line flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-volt flex items-center justify-center shadow-[0_0_20px_rgba(163,230,53,0.35)]">
          <Zap className="w-4.5 h-4.5 text-ink" fill="currentColor" strokeWidth={0} />
        </span>
        <span className="text-2xl font-extrabold text-text-hi tracking-tight" dir="ltr">
          Fit<span className="text-volt">AI</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} onClose={onClose} />
        ))}
        {user?.is_admin && (
          <>
            <div className="pt-2 pb-1 px-4 text-xs text-text-low uppercase tracking-wider">ניהול</div>
            {adminItems.map((item) => (
              <NavItem key={item.to} {...item} onClose={onClose} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-line">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-volt to-cyan flex items-center justify-center text-ink text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-text-hi text-sm font-medium truncate">
                {user?.full_name || "משתמש"}
              </p>
              {user?.is_admin && (
                <span className="text-xs bg-amber-soft text-amber px-1.5 py-0.5 rounded font-medium flex-shrink-0 inline-flex items-center gap-0.5">
                  אדמין <Crown className="w-3 h-3" />
                </span>
              )}
            </div>
            <p className="text-text-mid text-xs truncate" dir="ltr">{user?.email}</p>
          </div>
          <button
            onClick={() => toggleTheme(theme === "dark" ? "light" : "dark")}
            className="text-text-mid hover:text-text-hi transition-colors text-xs font-medium px-2 py-1 rounded-elem hover:bg-white/5 inline-flex items-center gap-1"
            title={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleLogout}
            className="text-coral hover:text-coral/80 transition-colors text-xs font-medium px-2 py-1 rounded-elem hover:bg-coral-soft inline-flex items-center gap-1"
            title="התנתק"
          >
            <LogOut className="w-3.5 h-3.5" />
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
}
