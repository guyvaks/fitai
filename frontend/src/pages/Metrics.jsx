import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import BMIMeter from "../components/ui/BMIMeter";
import { Target, Lightbulb, Loader2, AlertTriangle } from "lucide-react";

const GOAL_LABELS = {
  weight_loss: "ירידה במשקל",
  muscle_gain: "עלייה בשריר",
  maintenance: "שמירה על משקל",
  fitness_improvement: "שיפור כושר",
};

// Same macro split already used for daily targets in FoodLog.jsx (30% protein / 45% carbs / 25% fat)
const MACRO_SPLIT = [
  { key: "fat", label: "שומן", pct: 25, color: "var(--color-macro-fat)" },
  { key: "carbs", label: "פחמימות", pct: 45, color: "var(--color-macro-carbs)" },
  { key: "protein", label: "חלבון", pct: 30, color: "var(--color-macro-protein)" },
];

function MacroRing({ pct, color, size = 64 }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct / 100)}
      />
    </svg>
  );
}

export default function Metrics() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [saved, setSaved] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(false);

  const loadMetrics = () => {
    setFetching(true);
    setError(false);
    api
      .get("/api/v1/users/metrics")
      .then(({ data }) => {
        if (data.bmi) {
          setMetrics({
            bmi: data.bmi,
            bmi_category: data.bmi_category,
            bmr: data.bmr,
            tdee: data.tdee,
            target_calories: data.target_calories,
            goal: data.goal,
          });
          setSaved(true);
        }
      })
      .catch((err) => {
        // 404 just means the user hasn't saved a profile yet — a new user, not an error
        if (err.response?.status !== 404) {
          setError(true);
        }
      })
      .finally(() => setFetching(false));
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFetching(false);
      return;
    }
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  if (fetching) {
    return (
      <div className="flex justify-center items-center gap-2 h-40 text-text-mid card-glass">
        <Loader2 className="w-5 h-5 animate-spin text-volt" />
        טוען מדדים...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 h-40 card-glass text-center p-6"
        style={{ borderColor: "rgba(251,113,133,0.4)", background: "rgba(251,113,133,0.06)" }}
        dir="rtl"
      >
        <AlertTriangle className="w-6 h-6 text-coral" />
        <p className="text-coral text-sm font-medium">לא הצלחנו לטעון את המדדים</p>
        <button onClick={loadMetrics} className="btn-volt px-4 py-2 text-sm">
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="anim-rise">
        <h2 className="text-3xl font-extrabold text-text-hi tracking-tight">ניתוח מדדים</h2>
        <p className="text-text-mid mt-1">מבוסס על הנתונים האישיים שלך בדף הפרופיל</p>
      </div>

      {saved && metrics ? (
        <>
          <div className="anim-rise anim-d1 card-glass p-5 space-y-4">
            <h3 className="text-text-hi font-bold">ניתוח מדדים</h3>
            <BMIMeter bmi={metrics.bmi} category={metrics.bmi_category} />
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/4 border border-line rounded-elem p-3 text-center">
                <div className="text-text-mid text-xs">TDEE</div>
                <div className="text-text-hi text-xl font-extrabold tabular-nums" dir="ltr">{metrics.tdee?.toLocaleString() ?? "—"}</div>
                <div className="text-text-mid text-xs">קלוריות</div>
              </div>
              <div className="bg-white/4 border border-line rounded-elem p-3 text-center">
                <div className="text-text-mid text-xs">BMR</div>
                <div className="text-text-hi text-xl font-extrabold tabular-nums" dir="ltr">{metrics.bmr?.toLocaleString() ?? "—"}</div>
                <div className="text-text-mid text-xs">קלוריות</div>
              </div>
            </div>
            <div className="bg-volt-soft border border-volt/20 rounded-elem p-3 flex items-center justify-between">
              <div>
                <div className="text-text-mid text-xs">יעד קלוריות יומי</div>
                <div className="text-volt text-xl font-extrabold tabular-nums" dir="ltr">{metrics.target_calories?.toLocaleString() ?? "—"}</div>
                <div className="text-text-mid text-xs">קלוריות ליום</div>
              </div>
              <Target className="w-6 h-6 text-volt" />
            </div>
            <p className="text-text-mid text-xs leading-relaxed bg-cyan-soft border border-cyan/15 rounded-elem p-3">
              <span className="font-semibold text-cyan inline-flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> טיפ:{" "}
              </span>
              בהתבסס על ה-TDEE שלך, יעד של <span dir="ltr">{metrics.target_calories?.toLocaleString()}</span> קלוריות יאפשר לך {GOAL_LABELS[metrics.goal] || "התקדמות"} בקצב בריא.
            </p>
          </div>

          <div className="anim-rise anim-d2 card-glass p-5">
            <h3 className="text-text-hi font-bold mb-4">הרכב יעד תזונתי</h3>
            <div className="flex justify-around">
              {MACRO_SPLIT.map((m) => (
                <div key={m.key} className="flex flex-col items-center gap-1">
                  <div className="relative">
                    <MacroRing pct={m.pct} color={m.color} />
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-text-hi" dir="ltr">
                      {m.pct}%
                    </div>
                  </div>
                  <span className="text-text-mid text-xs">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="anim-rise anim-d1 card-glass p-5 flex flex-col items-center gap-3 text-center">
          <p className="text-text-mid text-sm">מלא את הפרטים בדף הפרופיל ושמור כדי לראות ניתוח מדדים</p>
          <button onClick={() => navigate('/profile')} className="btn-volt px-4 py-2 text-sm">
            לדף הפרופיל
          </button>
        </div>
      )}
    </div>
  );
}
