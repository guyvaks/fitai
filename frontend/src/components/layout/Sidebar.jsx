import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { PENDING_COUNT_CHANGED_EVENT } from "../../utils/pendingUpdates";
import {
  LayoutDashboard,
  Salad,
  Dumbbell,
  Play,
  TrendingUp,
  Activity,
  Bot,
  Settings,
  LogOut,
  Zap,
  Crown,
  Calculator,
  User,
  Users,
} from "lucide-react";
import Avatar from "../Avatar";

const navItems = [
  { to: "/dashboard", label: "ראשי", Icon: LayoutDashboard },
  { to: "/profile", label: "פרופיל", Icon: User },
  { to: "/nutrition", label: "תזונה", Icon: Salad },
  { to: "/calorie-calculator", label: "מחשבון קלוריות", Icon: Calculator },
  { to: "/workouts", label: "אימונים", Icon: Dumbbell },
  { to: "/live-workout", label: "אימון חי", Icon: Play },
  { to: "/progress", label: "התקדמות", Icon: TrendingUp },
  { to: "/metrics", label: "ניתוח מדדים", Icon: Activity },
  { to: "/ai-suggestion", label: "הצעות AI", Icon: Bot },
  { to: "/settings", label: "הגדרות", Icon: Settings },
];

const adminItems = [
  { to: "/admin", label: "ניהול משתמשים", Icon: Users },
];

function NavItem({ to, label, Icon, onClose, badge }) {
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
      {badge > 0 && (
        <span className="bg-coral text-white text-[10px] rounded-full px-1.5 py-0.5 ml-1">{badge}</span>
      )}
    </NavLink>
  );
}

export default function Sidebar({ onClose }) {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user?.is_admin) return;

    const fetchPendingCount = () => {
      Promise.all([
        api.get("/api/v1/admin/exercises/pending"),
        api.get("/api/v1/admin/food-master/pending"),
        // No dedicated "pending AI access" endpoint -- GET /users already
        // returns ai_access_approved for everyone, so count client-side.
        api.get("/api/v1/admin/users"),
      ])
        .then(([ex, foods, users]) => {
          const aiAccessCount = users.data.filter((u) => !u.ai_access_approved).length;
          setPendingCount(ex.data.length + foods.data.length + aiAccessCount);
        })
        .catch(() => {});
    };

    fetchPendingCount();
    window.addEventListener(PENDING_COUNT_CHANGED_EVENT, fetchPendingCount);
    return () => window.removeEventListener(PENDING_COUNT_CHANGED_EVENT, fetchPendingCount);
  }, [user?.is_admin]);

  const handleLogout = () => {
    localStorage.clear()
    window.location.href = '/login'
  }

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
              <NavItem key={item.to} {...item} onClose={onClose} badge={pendingCount} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-line">
        <div className="flex items-center gap-3">
          <Avatar user={user} className="w-9 h-9 text-sm" />
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
