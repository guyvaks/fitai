import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Smartphone } from "lucide-react";
import Sidebar from "./Sidebar";
import Header from "./Header";

// Tailwind's `md` breakpoint — below this the app already renders its mobile
// layout, so it's the natural line between "mobile" and "desktop".
const DESKTOP_BREAKPOINT = 768;

function useIsWideScreen(breakpoint = DESKTOP_BREAKPOINT) {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= breakpoint
  );
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return wide;
}

// Shown to non-admin users who open the app on a wide (desktop) screen —
// FitAI is a mobile-only product for regular users. Admins bypass this.
function MobileOnlyNotice() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-background"
      dir="rtl"
    >
      <span className="w-20 h-20 rounded-3xl bg-volt-soft text-volt flex items-center justify-center">
        <Smartphone className="w-10 h-10" />
      </span>
      <div className="space-y-2 max-w-sm">
        <h1 className="text-2xl font-extrabold text-text-hi">האפליקציה זמינה בנייד בלבד</h1>
        <p className="text-text-mid text-sm leading-relaxed">
          FitAI מיועדת לשימוש מהטלפון הנייד. פתח את הכתובת מהדפדפן בטלפון שלך כדי להמשיך.
        </p>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const isWide = useIsWideScreen();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Mobile-only for everyone except admins.
  if (isWide && !user?.is_admin) {
    return <MobileOnlyNotice />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - desktop always visible, mobile slide-in */}
      <aside
        className={`
          fixed top-0 right-0 h-full w-64 z-30 transform transition-transform duration-300
          md:static md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
