import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { agentsAPI, nutritionAPI, workoutsAPI, usersAPI } from "../services/api";
import {
  HeartPulse,
  Flame,
  Scale,
  Weight,
  Bot,
  Sparkles,
  Salad,
  Dumbbell,
  ShieldCheck,
  Trophy,
  UtensilsCrossed,
  ArrowLeft,
  Loader2,
  Lightbulb,
} from "lucide-react";
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
    { pct: caloriesPct, color: "#FB7185", track: "rgba(251,113,133,0.12)", radius: 78 },
    { pct: proteinPct, color: "#22D3EE", track: "rgba(34,211,238,0.12)", radius: 58 },
    { pct: workoutPct, color: "#A3E635", track: "rgba(163,230,53,0.12)", radius: 38 },
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
  const [hasPlan, setHasPlan] = useState(false);
  const [records, setRecords] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
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
        setHasPlan(!!data?.plan_data);
        const dayData = data?.plan_data?.[todayDayKey];
        if (dayData) {
          const exercises = Array.isArray(dayData) ? dayData : dayData.exercises || [];
          setTodayWorkout({ name: dayData.name || "אימון היום", count: exercises.length });
        }
      })
      .catch(() => {
        setTodayWorkout(null);
        setHasPlan(false);
      });

    workoutsAPI.getPersonalRecords()
      .then(({ data }) => setRecords(data || []))
      .catch(() => setRecords([]));

    usersAPI.getWeightHistory()
      .then(({ data }) => setWeightHistory(data || []))
      .catch(() => setWeightHistory([]));
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
    { label: "TDEE", value: tdee ? tdee.toLocaleString() : "—", Icon: HeartPulse, chip: "bg-coral-soft text-coral" },
    { label: "יעד קלוריות", value: targetCal ? targetCal.toLocaleString() : "—", Icon: Flame, chip: "bg-amber-soft text-amber" },
    { label: "BMI", value: bmi ?? "—", Icon: Scale, chip: "bg-volt-soft text-volt" },
    { label: "משקל נוכחי", value: weightKg ?? "—", Icon: Weight, chip: "bg-cyan-soft text-cyan" },
  ];

  const latestRecords = [...records]
    .sort((a, b) => new Date(b.achieved_at) - new Date(a.achieved_at))
    .slice(0, 3);

  const hasBodyFatData = weightHistory.some((e) => e.body_fat_pct != null);
  const weightChartData = weightHistory.map((e) => ({
    day: new Date(e.date).toLocaleDateString("he-IL", { day: "numeric", month: "short" }),
    weight: e.weight_kg,
    bodyFat: e.body_fat_pct,
  }));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Welcome */}
      <div className="anim-rise">
        <h2 className="text-3xl font-extrabold text-text-hi tracking-tight">
          בוקר טוב, <span className="text-gradient-volt">{firstName}</span>
        </h2>
        <p className="text-text-mid mt-1">{dateLabel}</p>
      </div>

      {/* AI pending suggestion banner */}
      {hasPendingSuggestion && (
        <div
          onClick={() => navigate('/ai-suggestion')}
          className="anim-rise anim-d1 card-glass card-hover p-4 text-sm text-volt cursor-pointer flex items-center justify-between"
          style={{ borderColor: "rgba(163,230,53,0.35)" }}
        >
          <span className="flex items-center gap-2 font-medium">
            <Bot className="w-4 h-4" />
            AI הכין לך תכנית חדשה! לחץ לצפייה ואישור
          </span>
          <ArrowLeft className="w-4 h-4" />
        </div>
      )}

      {/* No profile banner */}
      {!profile && (
        <div className="anim-rise anim-d1 card-glass p-4 text-sm text-cyan flex items-center gap-2">
          <Lightbulb className="w-4 h-4 flex-shrink-0" />
          <span>
            עדיין לא הגדרת פרופיל אישי. עבור ל<a href="/profile" className="underline font-medium text-volt">דף הפרופיל</a> כדי לראות נתונים אישיים.
          </span>
        </div>
      )}

      {/* Top metric cards + activity rings */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {topMetrics.map((m, i) => (
          <div key={m.label} className={`anim-rise anim-d${i + 1} card-glass card-hover p-4 flex flex-col min-h-[140px]`}>
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${m.chip}`}>
              <m.Icon className="w-4.5 h-4.5" strokeWidth={2.2} />
            </span>
            <div className="flex-1 flex flex-col justify-center pt-2">
              <div className="text-3xl font-extrabold text-text-hi tabular-nums text-right" dir="ltr">{m.value}</div>
              <div className="text-text-mid text-xs mt-1">{m.label}</div>
            </div>
          </div>
        ))}

        <div className="anim-rise anim-d5 col-span-2 md:col-span-1 card-glass p-4 flex flex-col items-center gap-3">
          <span className="text-text-mid text-sm self-start">פעילות יומית</span>
          {workoutPct === 0 && proteinPct === 0 && caloriesPct === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-2">
              <span className="w-10 h-10 rounded-full bg-volt-soft text-volt flex items-center justify-center">
                <Dumbbell className="w-5 h-5" />
              </span>
              <p className="text-text-mid text-xs leading-relaxed">
                עדיין לא תיעדת היום — בוא נתחיל
              </p>
              <button
                onClick={() => navigate('/nutrition?tab=daily')}
                className="text-volt text-xs font-medium hover:underline inline-flex items-center gap-1"
              >
                לתיעוד ארוחה
                <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <ActivityRings workoutPct={workoutPct} proteinPct={proteinPct} caloriesPct={caloriesPct} />
                <div className="absolute inset-0 flex items-center justify-center text-volt">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-volt font-semibold">אימון <span dir="ltr">{workoutPct}%</span></span>
                <span className="text-cyan font-semibold">חלבון <span dir="ltr">{proteinPct}%</span></span>
                <span className="text-coral font-semibold">קלוריות <span dir="ltr">{caloriesPct}%</span></span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI full plan card */}
      <div className="anim-rise anim-d2 card-glass p-5 relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(163,230,53,0.6), rgba(34,211,238,0.6), transparent)" }}
        />
        <div className="flex items-center gap-2 mb-2">
          <span className="w-8 h-8 rounded-xl bg-volt-soft text-volt flex items-center justify-center">
            <Bot className="w-4.5 h-4.5" />
          </span>
          <h3 className="text-text-hi font-bold">בנה תכנית שבועית מלאה</h3>
        </div>
        <div className="flex gap-2 mb-4 flex-wrap">
          <span className="bg-volt-soft text-volt text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1">
            <Salad className="w-3 h-3" /> תזונה
          </span>
          <span className="bg-cyan-soft text-cyan text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1">
            <Dumbbell className="w-3 h-3" /> אימונים
          </span>
          <span className="bg-violet-soft text-violet text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> מפקח AI
          </span>
        </div>
        <p className="text-text-mid text-sm mb-4 leading-relaxed">
          מפעיל 3 סוכני AI — תזונאי, מאמן כושר ומפקח — ליצירת תפריט תזונה שבועי מלא + תכנית אימונים. שניהם יישמרו לאחר האישור.
        </p>
        {fullPlanLoading && (
          <div className="mb-3 bg-cyan-soft border border-line rounded-elem px-3 py-2 text-cyan text-xs text-center flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            הסוכנים עובדים... זה לוקח כ-60-90 שניות
          </div>
        )}
        {fullPlanError && (
          <div className="mb-3 bg-coral-soft border border-line rounded-elem px-3 py-2 text-coral text-xs">
            {fullPlanError}
          </div>
        )}
        <button
          onClick={handleFullPlan}
          disabled={fullPlanLoading || !profile}
          className="btn-volt w-full py-3 text-sm flex items-center justify-center gap-2"
        >
          {fullPlanLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              יוצר תפריט + אימונים...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              בנה לי תכנית מלאה (תזונה + אימונים)
            </>
          )}
        </button>
        {!profile && (
          <p className="text-text-mid text-xs mt-2 text-center">יש להשלים פרופיל לפני יצירת תכנית</p>
        )}
      </div>

      {/* Weight progress chart */}
      <div className="anim-rise anim-d3 card-glass p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-text-hi font-bold">התקדמות משקל</h3>
          <div className="flex items-center gap-3 text-xs text-text-mid">
            {hasBodyFatData && (
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan inline-block" />אחוז שומן</span>
            )}
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-volt inline-block" />משקל</span>
          </div>
        </div>
        {weightHistory.length < 2 ? (
          <div className="h-[200px] flex items-center justify-center text-text-mid text-sm text-center px-6">
            עדיין אין מספיק נתונים להצגת מגמה
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} reversed />
              <YAxis
                yAxisId="weight"
                tick={{ fill: "#A3E635", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              {hasBodyFatData && (
                <YAxis
                  yAxisId="bodyFat"
                  orientation="right"
                  tick={{ fill: "#22D3EE", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  domain={["auto", "auto"]}
                />
              )}
              <Tooltip
                contentStyle={{ backgroundColor: "#1A2234", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", color: "#F1F5F9" }}
              />
              <Line yAxisId="weight" type="monotone" dataKey="weight" stroke="#A3E635" strokeWidth={2.5} dot={{ fill: "#A3E635", r: 3 }} />
              {hasBodyFatData && (
                <Line
                  yAxisId="bodyFat"
                  type="monotone"
                  dataKey="bodyFat"
                  stroke="#22D3EE"
                  strokeWidth={2.5}
                  dot={{ fill: "#22D3EE", r: 3 }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Today summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="anim-rise anim-d3 card-glass card-hover p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <span className="inline-block bg-cyan-soft text-cyan text-xs px-2.5 py-0.5 rounded-full font-medium mb-2">בתהליך</span>
            <h4 className="text-text-hi font-semibold text-sm mb-1">סיכום תזונה היום</h4>
            <p className="text-text-hi text-xl font-extrabold tabular-nums" dir="ltr">
              {consumedCalories.toLocaleString()} / {targetCal ? targetCal.toLocaleString() : "—"}
            </p>
            <p className="text-text-mid text-xs">קלוריות שנצרכו · נותר עד <span dir="ltr">{targetCal ? Math.max(0, targetCal - consumedCalories).toLocaleString() : "—"}</span></p>
          </div>
          <img
            src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop&q=80"
            alt="ארוחה בריאה"
            className="w-20 h-20 rounded-xl object-cover flex-shrink-0 ring-1 ring-line"
          />
        </div>

        <div className="anim-rise anim-d4 card-glass card-hover p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            {todayWorkout ? (
              <>
                <span className="inline-block bg-volt-soft text-volt text-xs px-2.5 py-0.5 rounded-full font-medium mb-2">בוצע</span>
                <h4 className="text-text-hi font-semibold text-sm mb-1">סיכום אימון היום</h4>
                <p className="text-text-hi text-xl font-extrabold">{todayWorkout.name}</p>
                <p className="text-text-mid text-xs">{todayWorkout.count} תרגילים</p>
              </>
            ) : hasPlan ? (
              <>
                <span className="inline-block bg-volt-soft text-volt text-xs px-2.5 py-0.5 rounded-full font-medium mb-2">מנוחה</span>
                <h4 className="text-text-hi font-semibold text-sm mb-1">סיכום אימון היום</h4>
                <p className="text-text-hi text-xl font-extrabold">יום מנוחה</p>
                <p className="text-text-mid text-xs">המנוחה חלק מהאימון</p>
              </>
            ) : (
              <>
                <span className="inline-block bg-white/6 text-text-mid text-xs px-2.5 py-0.5 rounded-full font-medium mb-2">אין תוכנית</span>
                <h4 className="text-text-hi font-semibold text-sm mb-1">סיכום אימון היום</h4>
                <p className="text-text-hi text-xl font-extrabold">עדיין לא תיעדת היום</p>
                <button
                  onClick={() => navigate('/workouts')}
                  className="text-volt text-xs font-medium hover:underline mt-1 inline-flex items-center gap-1"
                >
                  בוא נתחיל · לתיעוד אימון
                </button>
              </>
            )}
          </div>
          <img
            src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=160&h=160&fit=crop&q=80"
            alt="ציוד אימון"
            className="w-20 h-20 rounded-xl object-cover flex-shrink-0 ring-1 ring-line"
          />
        </div>
      </div>

      {/* Recent personal records */}
      <div className="anim-rise anim-d4 card-glass p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-text-hi font-bold">שיאים אישיים אחרונים</h3>
          <button onClick={() => navigate('/progress')} className="text-volt text-sm font-medium hover:underline inline-flex items-center gap-1">
            ראה הכל
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>
        {latestRecords.length === 0 ? (
          <p className="text-text-mid text-sm text-center py-4">אין שיאים עדיין — צא לאימון!</p>
        ) : (
          <div className="divide-y divide-line">
            {latestRecords.map((r) => {
              const delta = r.previous_record_kg != null ? r.record_weight_kg - r.previous_record_kg : null;
              return (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-amber-soft text-amber flex items-center justify-center">
                      <Trophy className="w-4 h-4" />
                    </span>
                    <div>
                      <p className="text-text-hi text-sm font-medium">{r.exercise_name}</p>
                      <p className="text-text-mid text-xs">{daysAgoLabel(r.achieved_at)}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-text-hi font-bold text-sm tabular-nums"><span dir="ltr">{r.record_weight_kg}</span> ק״ג</p>
                    {delta != null && (
                      <p className={`text-xs tabular-nums ${delta >= 0 ? "text-volt" : "text-coral"}`}>
                        <span dir="ltr">{delta >= 0 ? "+" : ""}{delta}</span> ק״ג
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
