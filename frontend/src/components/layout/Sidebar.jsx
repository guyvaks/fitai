import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const navItems = [
  { to: "/dashboard", label: "דשבורד", icon: "🏠" },
  { to: "/profile", label: "פרופיל", icon: "👤" },
  { to: "/nutrition", label: "תזונה", icon: "🥗" },
  { to: "/food-log", label: "יומן אכילה", icon: "📋" },
  { to: "/workouts", label: "אימונים", icon: "💪" },
  { to: "/live-workout", label: "אימון חי", icon: "▶️" },
  { to: "/progress", label: "התקדמות", icon: "📈" },
  { to: "/ai-suggestion", label: "הצעות AI", icon: "🤖" },
];

export default function Sidebar({ onClose }) {
  const { user } = useAuth();

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
    <div className="flex flex-col h-full bg-surface border-l border-slate-700">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <span className="text-2xl font-bold text-primary">FitAI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-elem text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "text-text-muted hover:bg-slate-700 hover:text-text-main"
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-main text-sm font-medium truncate">
              {user?.full_name || "משתמש"}
            </p>
            <p className="text-text-muted text-xs truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-red-400 hover:text-red-300 transition-colors text-xs font-medium px-2 py-1 rounded hover:bg-red-500/10"
            title="התנתק"
          >
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
}
