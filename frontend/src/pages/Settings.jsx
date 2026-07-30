import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import api, { authAPI, usersAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { isWebAuthnPlatformAvailable, runWebAuthnRegistration } from "../services/webauthn";
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
  Languages,
  Fingerprint,
  Trash2,
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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function AdminPushNotifications() {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupported(false);
      return;
    }
    (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager?.getSubscription();
        setSubscribed(!!existing);
      } catch {
        // no registration yet -- treat as not subscribed
      }
    })();
  }, []);

  const handleEnable = async () => {
    setError(null);
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("ההרשאה להתראות נדחתה");
        return;
      }

      const { data } = await api.get("/api/v1/push/vapid-public-key");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });

      await api.post("/api/v1/push/subscribe", subscription.toJSON());
      setSubscribed(true);
    } catch {
      setError("שגיאה בהפעלת התראות, נסה שוב");
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setError(null);
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        await api.delete("/api/v1/push/subscribe", { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError("שגיאה בביטול ההתראות, נסה שוב");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SectionCard icon={Bell} title="התראות פוש (מנהל)">
      {!supported ? (
        <p className="text-text-mid text-sm">התראות פוש אינן נתמכות בדפדפן/מכשיר זה</p>
      ) : (
        <>
          <p className="text-text-mid text-sm">קבל התראה כשמוצר או תרגיל חדש ממתין לאישור, גם כשהאפליקציה סגורה</p>
          {error && <p className="text-coral text-xs">{error}</p>}
          <button
            type="button"
            onClick={subscribed ? handleDisable : handleEnable}
            disabled={loading}
            className={`w-full py-2.5 text-sm rounded-elem font-medium transition inline-flex items-center justify-center gap-1.5 ${
              subscribed
                ? "border border-coral/30 text-coral hover:bg-coral-soft"
                : "btn-volt"
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "מעדכן..." : subscribed ? "כבה התראות" : "הפעל התראות"}
          </button>
        </>
      )}
    </SectionCard>
  );
}

export function WebAuthnSettings() {
  const [supported, setSupported] = useState(false);
  const [platformChecked, setPlatformChecked] = useState(false);
  const [credentials, setCredentials] = useState(null); // null = still loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadCredentials = async () => {
    try {
      const { data } = await authAPI.webauthnListCredentials();
      setCredentials(data);
    } catch {
      setCredentials([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    // Loading the credential list -- and letting the user revoke from it --
    // must NOT depend on *this* device having platform-authenticator
    // hardware. That's exactly the lost/stolen-device scenario this list
    // exists for: revoking a credential that belongs to a different device
    // you no longer have, from a machine that may not support WebAuthn at
    // all. Only registering a *new* credential needs platform support.
    loadCredentials();
    isWebAuthnPlatformAvailable().then((available) => {
      if (cancelled) return;
      setSupported(available);
      setPlatformChecked(true);
    });
    return () => { cancelled = true };
  }, []);

  const handleAddDevice = async () => {
    setError(null);
    setBusy(true);
    try {
      await runWebAuthnRegistration();
      await loadCredentials();
    } catch {
      setError("שגיאה ברישום המכשיר, נסה שוב");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id) => {
    setError(null);
    setBusy(true);
    try {
      await authAPI.webauthnRemoveCredential(id);
      await loadCredentials();
    } catch {
      setError("שגיאה בהסרת המכשיר, נסה שוב");
    } finally {
      setBusy(false);
    }
  };

  // Nothing to show: this device can't register a new credential, and there
  // are no existing ones to list/revoke either. Once credentials have
  // loaded, an unsupported device with a real credential list still renders
  // below (list + revoke only, no "Add Device" button).
  if (platformChecked && !supported && credentials !== null && credentials.length === 0) {
    return null;
  }

  return (
    <SectionCard icon={Fingerprint} title="כניסה עם Face ID / טביעת אצבע">
      <p className="text-text-mid text-sm">נהל את המכשירים שמורשים להיכנס לחשבון שלך בלי סיסמה</p>
      {error && <p className="text-coral text-xs">{error}</p>}

      {credentials === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-text-mid mx-auto" />
      ) : credentials.length === 0 ? (
        <p className="text-text-low text-xs">אין עדיין מכשירים רשומים</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between gap-2 bg-white/4 border border-line rounded-elem px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-text-hi text-sm truncate">{cred.device_label || "מכשיר"}</p>
                <p className="text-text-low text-xs">
                  נוסף ב-{new Date(cred.created_at).toLocaleDateString("he-IL")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(cred.id)}
                disabled={busy}
                className="text-text-mid hover:text-coral transition p-1 shrink-0"
                aria-label="הסר מכשיר"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {supported && (
        <button
          type="button"
          onClick={handleAddDevice}
          disabled={busy}
          className="w-full py-2.5 text-sm rounded-elem font-medium border border-volt/40 text-volt hover:bg-volt-soft transition inline-flex items-center justify-center gap-1.5"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? "מעדכן..." : "הוסף מכשיר"}
        </button>
      )}
    </SectionCard>
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
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [restTimerOverride, setRestTimerOverride] = useState("");
  const [autoStartRest, setAutoStartRest] = useState(true);
  const [savingWorkoutPrefs, setSavingWorkoutPrefs] = useState(false);
  const [workoutPrefsSaved, setWorkoutPrefsSaved] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState(null);

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

  const handleChangeLanguage = async (value) => {
    setSavingLanguage(true);
    setLanguageError(null);
    try {
      const { data } = await usersAPI.updatePreferredLanguage(value);
      updateUser({ preferred_language: data.preferred_language });
    } catch {
      setLanguageError("שגיאה בעדכון השפה");
    } finally {
      setSavingLanguage(false);
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

      <SectionCard icon={Languages} title="שפה">
        <div className="flex flex-col gap-1.5">
          <label className="text-text-mid text-sm">שפה מועדפת</label>
          <select
            value={user?.preferred_language ?? "he"}
            onChange={(e) => handleChangeLanguage(e.target.value)}
            disabled={savingLanguage}
            className="input-volt disabled:opacity-50"
          >
            <option value="he">עברית</option>
            <option value="en">English</option>
          </select>
          <p className="text-text-low text-xs">
            שינוי זה שומר את ההעדפה שלך בלבד — ממשק האפליקציה עדיין יוצג בעברית בשלב זה
          </p>
          {languageError && <p className="text-coral text-xs">{languageError}</p>}
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
        <p className="text-text-hi text-sm font-medium" dir="auto">{user?.username}</p>
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
          <NavLink
            to="/privacy-policy"
            className="flex items-center justify-between text-text-mid hover:text-volt transition py-2 text-sm"
          >
            מדיניות פרטיות
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

      <WebAuthnSettings />

      {user?.is_admin && <AdminPushNotifications />}

      <ComingSoonCard icon={Bell} title="התראות" description="עדכונים על תוכניות ותזכורות אימון" />
      <ComingSoonCard icon={Download} title="ייצוא וגיבוי נתונים" description="הורדת כל הנתונים שלך כקובץ" />
      <ComingSoonCard icon={HelpCircle} title="עזרה ותמיכה" description="שאלות נפוצות ויצירת קשר" />
    </div>
  );
}
