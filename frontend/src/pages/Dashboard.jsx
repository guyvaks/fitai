import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { agentsAPI, nutritionAPI, workoutsAPI } from "../services/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const weeklyWeightDemo = [
  { day: "א", weight: 79.5, bodyFat: 22.5 },
  { day: "ב", weight: 79.2, bodyFat: 22.3 },
  { day: "ג", weight: 79.0, bodyFat: 22.0 },
  { day: "ד", weight: 78.9, bodyFat: 21.9 },
  { day: "ה", weight: 78.7, bodyFat: 21.7 },
  { day: "ו", weight: 78.6, bodyFat: 21.6 },
  { day: "ש", weight: 78.5, bodyFat: 21.5 },
];

function toIso(date) {
  return date.toISOString().split("T")[0];
}

function daysAgoLabel(dateStr) {
  if (!dateStr) return "";
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diffDays <= 0) return "היום";
  if (diffDays === 1) return "אתמול";
  return `לפני ${diffDays} ימים`;
}

function ActivityRings({ workoutPct, proteinPct, caloriesPct }) {
  const size = 176;
  const center = size / 2;
  const rings = [
    { pct: caloriesPct, color: "#EF4444", track: "#FEE2E2", radius: 78 },
    { pct: proteinPct, color: "#22C55E", track: "#DCFCE7", radius: 58 },
    { pct: workoutPct, color: "#F97316", track: "#FFEDD5", radius: 38 },
  ];

  return (
    <svg width={size} height={size} className="-rotate-90">
      {rings.map((r) => {
        const circumference = 2 * Math.PI * r.radius;
        const clamped = Math.max(0, Math.min(100, r.pct));
        return (
          <g key={r.radius}>
            <circle cx={center} cy={center} r={r.radius} fill="none" stroke={r.track} strokeWidth="12" />
            <circle
              cx={center}
              cy={center}
              r={r.radius}
              fill="none"
              stroke={r.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - clamped / 100)}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasPendingSuggestion, setHasPendingSuggestion] = useState(false);
  const [fullPlanLoading, setFullPlanLoading] = useState(false);
  const [fullPlanError, setFullPlanError] = useState(null);
  const [todayLogs, setTodayLogs] = useState([]);
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [records, setRecords] = useState([]);
  const firstName = user?.full_name?.split(" ")[0] || "משתמש";
  const today = new Date();
  const todayDayKey = DAY_KEYS[today.getDay()];
  const dateLabel = today.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    agentsAPI.getPending()
      .then(r => setHasPendingSuggestion((r.data?.length ?? 0) > 0))
      .catch(() => setHasPendingSuggestion(false));
  }, [location.pathname]);

  useEffect(() => {
    nutritionAPI.getDayLog(toIso(today))
      .then(r => setTodayLogs(r.data))
      .catch(() => setTodayLogs([]));

    workoutsAPI.getPlan()
      .then(({ data }) => {
        const dayData = data?.plan_data?.[todayDayKey];
        if (dayData) {
          const exercises = Array.isArray(dayData) ? dayData : dayData.exercises || [];
          setTodayWorkout({ name: dayData.name || "אימון היום", count: exercises.length });
        }
      })
      .catch(() => setTodayWorkout(null));

    workoutsAPI.getPersonalRecords()
      .then(({ data }) => setRecords(data || []))
      .catch(() => setRecords([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFullPlan = async () => {
    setFullPlanLoading(true);
    setFullPlanError(null);
    try {
      const r = await agentsAPI.generateFullPlan();
      const taskId = r.data.task_id;
      // Poll until ready
      const poll = setInterval(async () => {
        try {
          const s = await agentsAPI.getStatus(taskId);
          if (s.data.status === 'ready') {
            clearInterval(poll);
            setFullPlanLoading(false);
            navigate('/ai-suggestion');
          } else if (s.data.status === 'error') {
            clearInterval(poll);
            setFullPlanLoading(false);
            setFullPlanError(s.data.error || 'שגיאה ביצירת התכנית');
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) {
      setFullPlanLoading(false);
      setFullPlanError(e.response?.data?.detail || 'שגיאה בהפעלת ה-AI');
    }
  };

  const targetCal = profile?.target_calories;
  const bmi = profile?.bmi;
  const weightKg = profile?.weight_kg;
  const tdee = profile?.tdee;

  const consumedCalories = todayLogs.reduce((sum, l) => sum + (l.calories || 0), 0);
  const consumedProtein = todayLogs.reduce((sum, l) => sum + (l.protein || 0), 0);
  const targetProtein = targetCal ? Math.round((targetCal * 0.3) / 4) : null;

  const caloriesPct = targetCal ? Math.min(100, Math.round((consumedCalories / targetCal) * 100)) : 0;
  const proteinPct = targetProtein ? Math.min(100, Math.round((consumedProtein / targetProtein) * 100)) : 0;
  const workoutPct = todayWorkout ? 90 : 0;

  const topMetrics = [
    { label: "TDEE", value: tdee ? tdee.toLocaleString() : "—", icon: "🫀", iconBg: "bg-red-50", iconColor: "text-red-500" },
    { label: "יעד קלוריות", value: targetCal ? targetCal.toLocaleString() : "—", icon: "🔥", iconBg: "bg-orange-50", iconColor: "text-orange-500" },
    { label: "BMI", value: bmi ?? "—", icon: "⚖️", iconBg: "bg-green-50", iconColor: "text-green-500" },
    { label: "משקל נוכחי", value: weightKg ?? "—", icon: "📏", iconBg: "bg-blue-50", iconColor: "text-accent-blue" },
  ];

  const latestRecords = [...records]
    .sort((a, b) => new Date(b.achieved_at) - new Date(a.achieved_at))
    .slice(0, 3);

  return (
    <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-dark-text">
          בוקר טוב, {firstName}
        </h2>
        <p className="text-dark-text-muted mt-1">{dateLabel}</p>
      </div>

      {/* AI pending suggestion banner */}
      {hasPendingSuggestion && (
        <div
          onClick={() => navigate('/ai-suggestion')}
          className="bg-blue-50 border border-blue-200 rounded-card p-4 text-sm text-accent-blue cursor-pointer hover:bg-blue-100 transition flex items-center justify-between"
        >
          <span>🤖 AI הכין לך תכנית חדשה! לחץ לצפייה ואישור</span>
          <span>←</span>
        </div>
      )}

      {/* No profile banner */}
      {!profile && (
        <div className="bg-blue-50 border border-blue-200 rounded-card p-4 text-sm text-accent-blue">
          💡 עדיין לא הגדרת פרופיל אישי. עבור ל<a href="/profile" className="underline font-medium">דף הפרופיל</a> כדי לראות נתונים אישיים.
        </div>
      )}

      {/* Top metric cards + activity rings */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {topMetrics.map((m) => (
          <div key={m.label} className="bg-white border border-light-border rounded-card p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between min-h-[140px]">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${m.iconBg}`}>
              {m.icon}
            </span>
            <div>
              <div className="text-2xl font-bold text-dark-text">{m.value}</div>
              <div className="text-dark-text-muted text-xs mt-0.5">{m.label}</div>
            </div>
          </div>
        ))}

        <div className="col-span-2 md:col-span-1 bg-white border border-light-border rounded-card p-4 shadow-sm flex flex-col items-center gap-3">
          <span className="text-dark-text-muted text-sm self-start">פעילות יומית</span>
          {workoutPct === 0 && proteinPct === 0 && caloriesPct === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-2">
              <span className="text-2xl">💪</span>
              <p className="text-dark-text-muted text-xs leading-relaxed">
                עדיין לא תיעדת היום — בוא נתחיל
              </p>
              <button
                onClick={() => navigate('/food-log')}
                className="text-accent-blue text-xs font-medium hover:underline"
              >
                לתיעוד ארוחה ←
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <ActivityRings workoutPct={workoutPct} proteinPct={proteinPct} caloriesPct={caloriesPct} />
                <div className="absolute inset-0 flex items-center justify-center text-xl">🍽️</div>
              </div>
              <div className="flex gap-3 text-xs text-dark-text-muted">
                <span className="text-orange-500 font-semibold">אימון {workoutPct}%</span>
                <span className="text-green-600 font-semibold">חלבון {proteinPct}%</span>
                <span className="text-red-500 font-semibold">קלוריות {caloriesPct}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI full plan card */}
      <div className="bg-white border border-light-border rounded-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🤖</span>
          <h3 className="text-dark-text font-semibold">בנה תכנית שבועית מלאה</h3>
        </div>
        <div className="flex gap-3 mb-4">
          <span className="bg-blue-50 text-accent-blue text-xs px-2 py-1 rounded-full font-medium">🥗 תזונה</span>
          <span className="bg-indigo-50 text-indigo-600 text-xs px-2 py-1 rounded-full font-medium">💪 אימונים</span>
          <span className="bg-purple-50 text-purple-600 text-xs px-2 py-1 rounded-full font-medium">✅ מפקח AI</span>
        </div>
        <p className="text-dark-text-muted text-sm mb-4 leading-relaxed">
          מפעיל 3 סוכני AI — תזונאי, מאמן כושר ומפקח — ליצירת תפריט תזונה שבועי מלא + תכנית אימונים. שניהם יישמרו לאחר האישור.
        </p>
        {fullPlanLoading && (
          <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-accent-blue text-xs text-center">
            ⏳ הסוכנים עובדים... זה לוקח כ-60-90 שניות
          </div>
        )}
        {fullPlanError && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-xs">
            {fullPlanError}
          </div>
        )}
        <button
          onClick={handleFullPlan}
          disabled={fullPlanLoading || !profile}
          className="w-full bg-accent-blue text-white py-3 rounded-xl font-semibold text-sm hover:bg-accent-blue/90 disabled:opacity-50 transition shadow-sm"
        >
          {fullPlanLoading ? '⏳ יוצר תפריט + אימונים...' : '✨ בנה לי תכנית מלאה (תזונה + אימונים)'}
        </button>
        {!profile && (
          <p className="text-dark-text-muted text-xs mt-2 text-center">יש להשלים פרופיל לפני יצירת תכנית</p>
        )}
      </div>

      {/* Weekly weight progress chart */}
      <div className="bg-white border border-light-border rounded-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-dark-text font-semibold">התקדמות משקל שבועי</h3>
          <div className="flex items-center gap-3 text-xs text-dark-text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />אחוז שומן</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-blue inline-block" />משקל</span>
          </div>
        </div>
        {new Set(weeklyWeightDemo.map(d => d.weight)).size < 2 ? (
          <div className="h-[200px] flex items-center justify-center text-dark-text-muted text-sm text-center px-6">
            עדיין אין מספיק נתונים להצגת מגמה
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weeklyWeightDemo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#6B7280", fontSize: 12 }} axisLine={false} tickLine={false} reversed />
              <YAxis tick={{ fill: "#6B7280", fontSize: 12 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: "8px", color: "#111827" }}
              />
              <Line type="monotone" dataKey="weight" stroke="#2563EB" strokeWidth={2} dot={{ fill: "#2563EB", r: 3 }} />
              <Line type="monotone" dataKey="bodyFat" stroke="#22C55E" strokeWidth={2} dot={{ fill: "#22C55E", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Today summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-light-border rounded-card p-4 shadow-sm flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <span className="inline-block bg-blue-50 text-accent-blue text-xs px-2 py-0.5 rounded-full font-medium mb-2">בתהליך</span>
            <h4 className="text-dark-text font-semibold text-sm mb-1">סיכום תזונה היום</h4>
            <p className="text-dark-text text-lg font-bold" dir="ltr">
              {consumedCalories.toLocaleString()} / {targetCal ? targetCal.toLocaleString() : "—"}
            </p>
            <p className="text-dark-text-muted text-xs">קלוריות שנצרכו · נותר עד {targetCal ? Math.max(0, targetCal - consumedCalories).toLocaleString() : "—"}</p>
          </div>
          <img
            src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop&q=80"
            alt="ארוחה בריאה"
            className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
          />
        </div>

        <div className="bg-white border border-light-border rounded-card p-4 shadow-sm flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <span className="inline-block bg-green-50 text-green-600 text-xs px-2 py-0.5 rounded-full font-medium mb-2">
              {todayWorkout ? "בוצע" : "מנוחה"}
            </span>
            <h4 className="text-dark-text font-semibold text-sm mb-1">סיכום אימון היום</h4>
            <p className="text-dark-text text-lg font-bold">{todayWorkout?.name || "יום מנוחה"}</p>
            <p className="text-dark-text-muted text-xs">{todayWorkout ? `${todayWorkout.count} תרגילים` : "המנוחה חלק מהאימון"}</p>
          </div>
          <img
            src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=160&h=160&fit=crop&q=80"
            alt="ציוד אימון"
            className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
          />
        </div>
      </div>

      {/* Recent personal records */}
      <div className="bg-white border border-light-border rounded-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-dark-text font-semibold">שיאים אישיים אחרונים</h3>
          <button onClick={() => navigate('/progress')} className="text-accent-blue text-sm font-medium hover:underline">ראה הכל</button>
        </div>
        {latestRecords.length === 0 ? (
          <p className="text-dark-text-muted text-sm text-center py-4">אין שיאים עדיין — צא לאימון!</p>
        ) : (
          <div className="divide-y divide-light-border">
            {latestRecords.map((r) => {
              const delta = r.previous_record_kg != null ? r.record_weight_kg - r.previous_record_kg : null;
              return (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-yellow-50 flex items-center justify-center text-base">🏅</span>
                    <div>
                      <p className="text-dark-text text-sm font-medium">{r.exercise_name}</p>
                      <p className="text-dark-text-muted text-xs">{daysAgoLabel(r.achieved_at)}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-dark-text font-bold text-sm">{r.record_weight_kg} ק״ג</p>
                    {delta != null && (
                      <p className={`text-xs ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {delta >= 0 ? "+" : ""}{delta} ק״ג
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
