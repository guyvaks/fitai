import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const pageTitles = {
  "/dashboard": "דשבורד",
  "/profile": "פרופיל ומדדים",
  "/nutrition": "תזונה",
  "/food-log": "יומן אכילה",
  "/workouts": "אימונים",
  "/live-workout": "אימון חי",
  "/progress": "התקדמות",
  "/ai-suggestion": "הצעות AI",
};

export default function Header({ onToggleSidebar }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const title = pageTitles[location.pathname] || "FitAI";

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <header className="h-16 bg-surface border-b border-slate-700 flex items-center justify-between px-4 md:px-6">
      {/* Mobile hamburger + logo */}
      <div className="flex items-center gap-3">
        <button
          className="md:hidden text-text-muted hover:text-text-main p-2 -mr-2"
          onClick={onToggleSidebar}
          aria-label="תפריט"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="md:hidden text-xl font-bold text-primary">FitAI</span>
        <h1 className="hidden md:block text-lg font-semibold text-text-main">{title}</h1>
      </div>

      {/* Desktop: user info */}
      <div className="hidden md:flex items-center gap-3">
        <span className="text-text-muted text-sm">{user?.full_name}</span>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
      </div>

      {/* Mobile: page title */}
      <h1 className="md:hidden text-base font-semibold text-text-main">{title}</h1>

      {/* Mobile: home button */}
      <button
        className="md:hidden text-text-muted hover:text-primary p-2 transition-colors"
        onClick={() => navigate('/dashboard')}
        aria-label="בית"
      >
        🏠
      </button>
    </header>
  );
}
