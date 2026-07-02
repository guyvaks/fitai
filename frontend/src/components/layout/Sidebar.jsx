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

const adminItems = [
  { to: "/admin", label: "ניהול משתמשים", icon: "⚙️" },
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
    <div className="flex flex-col h-full bg-white border-l border-light-border">
      {/* Logo */}
      <div className="p-6 border-b border-light-border">
        <span className="text-2xl font-bold text-accent-blue">FitAI</span>
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
                  ? "bg-accent-blue text-white"
                  : "text-dark-text-muted hover:bg-blue-50 hover:text-dark-text"
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        {user?.is_admin && (
          <>
            <div className="pt-2 pb-1 px-4 text-xs text-dark-text-muted uppercase tracking-wider">ניהול</div>
            {adminItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-elem text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent-blue text-white"
                      : "text-dark-text-muted hover:bg-blue-50 hover:text-dark-text"
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-light-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-accent-blue flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-dark-text text-sm font-medium truncate">
                {user?.full_name || "משתמש"}
              </p>
              {user?.is_admin && (
                <span className="text-xs bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded font-medium flex-shrink-0">אדמין 👑</span>
              )}
            </div>
            <p className="text-dark-text-muted text-xs truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-red-600 hover:text-red-700 transition-colors text-xs font-medium px-2 py-1 rounded hover:bg-red-50"
            title="התנתק"
          >
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
}
