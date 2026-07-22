import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../context/ThemeContext";
import {
  Sun,
  Moon,
  Dumbbell,
  User as UserIcon,
  Activity,
  LogOut,
  Bell,
  Download,
  HelpCircle,
  Loader2,
  ChevronLeft,
} from "lucide-react";

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="anim-rise card-glass p-5 space-y-4">
      <h3 className="text-text-hi font-bold flex items-center gap-2">
        <Icon className="w-4.5 h-4.5 text-volt" /> {title}
      </h3>
      {children}
    </div>
  );
}

function ComingSoonCard({ icon: Icon, title, description }) {
  return (
    <div className="anim-rise card-glass p-5 flex items-center gap-4 opacity-60">
      <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-white/5">
        <Icon className="w-4.5 h-4.5 text-text-mid" />
      </div>
      <div className="flex-1">
        <p className="text-text-hi font-medium text-sm">{title}</p>
        <p className="text-text-low text-xs mt-0.5">{description}</p>
      </div>
      <span className="text-xs text-text-low border border-line rounded-elem px-2 py-1 shrink-0">בקרוב</span>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [restTimerOverride, setRestTimerOverride] = useState("");
  const [autoStartRest, setAutoStartRest] = useState(true);
  const [savingWorkoutPrefs, setSavingWorkoutPrefs] = useState(false);
  const [workoutPrefsSaved, setWorkoutPrefsSaved] = useState(false);

  useEffect(() => {
    api
      .get("/api/v1/users/profile")
      .then(({ data }) => {
        const prefs = data?.workout_preferences;
        if (prefs?.rest_timer_seconds != null) setRestTimerOverride(String(prefs.rest_timer_seconds));
        if (prefs?.auto_start_rest === false) setAutoStartRest(false);
      })
      .catch(() => {}); // no saved profile yet -- defaults are fine
  }, []);

  const handleSaveWorkoutPrefs = async () => {
    setSavingWorkoutPrefs(true);
    setWorkoutPrefsSaved(false);
    try {
      const seconds = parseInt(restTimerOverride, 10);
      await api.put("/api/v1/users/profile", {
        workout_preferences: {
          rest_timer_seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
          auto_start_rest: autoStartRest,
        },
      });
      setWorkoutPrefsSaved(true);
    } finally {
      setSavingWorkoutPrefs(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="anim-rise">
        <h2 className="text-3xl font-extrabold text-text-hi tracking-tight">הגדרות</h2>
        <p className="text-text-mid mt-1">התאמה אישית של האפליקציה והחשבון שלך</p>
      </div>

      <SectionCard icon={theme === "dark" ? Moon : Sun} title="מראה">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggleTheme("dark")}
            className={`flex-1 py-2.5 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
              theme === "dark" ? "bg-volt text-ink" : "bg-white/4 border border-line text-text-mid hover:text-text-hi"
            }`}
          >
            <Moon className="w-4 h-4" /> כהה
          </button>
          <button
            type="button"
            onClick={() => toggleTheme("light")}
            className={`flex-1 py-2.5 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
              theme === "light" ? "bg-volt text-ink" : "bg-white/4 border border-line text-text-mid hover:text-text-hi"
            }`}
          >
            <Sun className="w-4 h-4" /> בהיר
          </button>
        </div>
      </SectionCard>

      <SectionCard icon={Dumbbell} title="העדפות אימון">
        <div className="flex flex-col gap-1.5">
          <label className="text-text-mid text-sm">זמן מנוחה ברירת מחדל (שניות)</label>
          <input
            type="number"
            min="0"
            placeholder="לפי התוכנית (ברירת מחדל)"
            value={restTimerOverride}
            onChange={(e) => setRestTimerOverride(e.target.value)}
            className="input-volt"
            dir="ltr"
          />
          <p className="text-text-low text-xs">השאר ריק כדי להשתמש בזמן המנוחה שמוגדר לכל תרגיל בתוכנית</p>
        </div>

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-text-mid text-sm">התחלה אוטומטית של טיימר מנוחה</span>
          <button
            type="button"
            onClick={() => setAutoStartRest((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${autoStartRest ? "bg-volt" : "bg-white/15"}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoStartRest ? "right-0.5" : "right-5.5"}`} />
          </button>
        </label>

        <button
          type="button"
          onClick={handleSaveWorkoutPrefs}
          disabled={savingWorkoutPrefs}
          className="btn-volt w-full py-2.5 text-sm flex items-center justify-center gap-1.5"
        >
          {savingWorkoutPrefs && <Loader2 className="w-4 h-4 animate-spin" />}
          {savingWorkoutPrefs ? "שומר..." : workoutPrefsSaved ? "נשמר ✓" : "שמור העדפות"}
        </button>
      </SectionCard>

      <SectionCard icon={UserIcon} title="חשבון">
        <p className="text-text-mid text-sm" dir="ltr">{user?.email}</p>
        <div className="flex flex-col gap-1">
          <NavLink
            to="/profile"
            className="flex items-center justify-between text-text-mid hover:text-volt transition py-2 text-sm"
          >
            עריכת פרטים אישיים
            <ChevronLeft className="w-4 h-4" />
          </NavLink>
          <NavLink
            to="/metrics"
            className="flex items-center justify-between text-text-mid hover:text-volt transition py-2 text-sm"
          >
            <span className="inline-flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> ניתוח מדדים</span>
            <ChevronLeft className="w-4 h-4" />
          </NavLink>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-coral hover:text-coral/80 transition text-sm font-medium py-2.5 rounded-elem hover:bg-coral-soft inline-flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-4 h-4" /> התנתקות
        </button>
      </SectionCard>

      <ComingSoonCard icon={Bell} title="התראות" description="עדכונים על תוכניות ותזכורות אימון" />
      <ComingSoonCard icon={Download} title="ייצוא וגיבוי נתונים" description="הורדת כל הנתונים שלך כקובץ" />
      <ComingSoonCard icon={HelpCircle} title="עזרה ותמיכה" description="שאלות נפוצות ויצירת קשר" />
    </div>
  );
}
