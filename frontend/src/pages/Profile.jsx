import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";
import BMIMeter from "../components/ui/BMIMeter";
import { Target, Lightbulb, Loader2, AlertTriangle, ArrowLeft, UserPlus } from "lucide-react";

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "מושבי", desc: "ללא פעילות גופנית" },
  { value: "lightly_active", label: "פעיל קלות", desc: "1-3 אימונים בשבוע" },
  { value: "moderately_active", label: "פעיל בינוני", desc: "3-5 ימים בשבוע" },
  { value: "very_active", label: "פעיל מאוד", desc: "6-7 ימים בשבוע" },
  { value: "extra_active", label: "ספורטאי", desc: "פעילות אינטנסיבית פעמיים ביום" },
];

const GOAL_OPTIONS = [
  { value: "weight_loss", label: "ירידה במשקל" },
  { value: "muscle_gain", label: "עלייה בשריר" },
  { value: "maintenance", label: "שמירה על משקל" },
  { value: "fitness_improvement", label: "שיפור כושר" },
];

const EQUIPMENT_OPTIONS = [
  "ללא ציוד",
  "משקולות",
  "מוט + משקולות",
  "TRX",
  "אופניים",
  "שחייה",
];

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

const defaultForm = {
  age: "",
  gender: "male",
  height_cm: "",
  weight_kg: "",
  target_weight_kg: "",
  activity_level: "",
  goal: "",
  medical_conditions: "",
  injuries: "",
  allergies: "",
  equipment: [],
  meals_per_day: 5,
};

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

export default function Profile() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState(defaultForm);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [isNewProfile, setIsNewProfile] = useState(false);

  const loadProfile = () => {
    setFetchingProfile(true);
    setProfileError(false);
    setIsNewProfile(false);
    api
      .get("/api/v1/users/profile")
      .then(({ data }) => {
        setForm({
          age: data.age ?? "",
          gender: data.gender ?? "male",
          height_cm: data.height_cm ?? "",
          weight_kg: data.weight_kg ?? "",
          target_weight_kg: data.target_weight_kg ?? "",
          activity_level: data.activity_level ?? "",
          goal: data.goal ?? "",
          medical_conditions: data.medical_conditions ?? "",
          injuries: data.injuries ?? "",
          allergies: data.allergies ?? "",
          equipment: Array.isArray(data.equipment) ? data.equipment : [],
          meals_per_day: data.meals_per_day ?? 5,
        });
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
        if (err.response?.status === 404) {
          setIsNewProfile(true);
        } else {
          setProfileError(true);
        }
      })
      .finally(() => setFetchingProfile(false));
  };

  // Load existing profile once auth is resolved. Guarding on the auth state
  // avoids a race where loadProfile fires before useAuth has restored the
  // token/user from localStorage, which would 401 and bounce to /login.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Not authenticated — App's route guard will redirect; don't fetch.
      setFetchingProfile(false);
      return;
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const handleEquipmentToggle = (item) => {
    setForm((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter((e) => e !== item)
        : [...prev.equipment, item],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        ...form,
        age: Number(form.age),
        height_cm: Number(form.height_cm),
        weight_kg: Number(form.weight_kg),
        target_weight_kg: form.target_weight_kg ? Number(form.target_weight_kg) : null,
        meals_per_day: Number(form.meals_per_day),
      };
      const { data } = await api.post("/api/v1/users/profile", payload);
      setMetrics({
        bmi: data.bmi,
        bmi_category: data.bmi_category,
        bmr: data.bmr,
        tdee: data.tdee,
        target_calories: data.target_calories,
        goal: data.goal,
      });
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בשמירת הפרופיל");
    } finally {
      setLoading(false);
    }
  };

  if (fetchingProfile) {
    return (
      <div className="flex justify-center items-center gap-2 h-40 text-text-mid card-glass">
        <Loader2 className="w-5 h-5 animate-spin text-volt" />
        טוען פרופיל...
      </div>
    );
  }

  if (profileError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 h-40 card-glass text-center p-6"
        style={{ borderColor: "rgba(251,113,133,0.4)", background: "rgba(251,113,133,0.06)" }}
        dir="rtl"
      >
        <AlertTriangle className="w-6 h-6 text-coral" />
        <p className="text-coral text-sm font-medium">לא הצלחנו לטעון את הפרופיל</p>
        <button
          onClick={loadProfile}
          className="btn-volt px-4 py-2 text-sm"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="anim-rise">
        <h2 className="text-3xl font-extrabold text-text-hi tracking-tight">פרופיל ומדדים</h2>
        <p className="text-text-mid mt-1">עדכן את הנתונים האישיים שלך לקבלת תוכנית מותאמת אישית</p>
      </div>

      {isNewProfile && (
        <div className="anim-rise flex items-center gap-4 rounded-card border border-volt/30 bg-volt-soft p-5">
          <div className="shrink-0 flex items-center justify-center w-11 h-11 rounded-full bg-volt/15">
            <UserPlus className="w-5 h-5 text-volt" />
          </div>
          <div>
            <p className="text-text-hi font-bold">ברוך הבא! נשמח להכיר אותך</p>
            <p className="text-text-mid text-sm mt-0.5">
              מלא את הפרטים כדי שנוכל ליצור עבורך תוכנית מותאמת אישית
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Metrics analysis (left side in RTL) */}
        <div className="space-y-6 lg:order-2">
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
            <div className="anim-rise anim-d1 card-glass p-5 text-center text-text-mid text-sm">
              מלא את הפרטים ושמור כדי לראות ניתוח מדדים
            </div>
          )}
        </div>

        {/* Form (right side in RTL) */}
        <form onSubmit={handleSubmit} className="anim-rise anim-d1 card-glass p-6 space-y-6 lg:order-1">
          {/* Age + Gender */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-text-mid text-sm">גיל</label>
              <input
                type="number"
                min="10"
                max="120"
                required
                value={form.age}
                onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
                className="input-volt"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-text-mid text-sm">מין</label>
              <select
                value={form.gender}
                onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                className="input-volt"
              >
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
          </div>

          {/* Height + Weight + Target */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-text-mid text-sm">גובה (ס״מ)</label>
              <input
                type="number"
                min="100"
                max="250"
                required
                value={form.height_cm}
                onChange={(e) => setForm((p) => ({ ...p, height_cm: e.target.value }))}
                className="input-volt"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-text-mid text-sm">משקל (ק״ג)</label>
              <input
                type="number"
                min="20"
                max="300"
                step="0.1"
                required
                value={form.weight_kg}
                onChange={(e) => setForm((p) => ({ ...p, weight_kg: e.target.value }))}
                className="input-volt"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-text-mid text-sm">משקל יעד (ק״ג)</label>
              <input
                type="number"
                min="20"
                max="300"
                step="0.1"
                value={form.target_weight_kg}
                onChange={(e) => setForm((p) => ({ ...p, target_weight_kg: e.target.value }))}
                className="input-volt"
              />
            </div>
          </div>

          {/* Goal */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-mid text-sm">מטרה</label>
            <select
              value={form.goal}
              onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))}
              required
              className="input-volt"
            >
              <option value="" disabled>בחר מטרה</option>
              {GOAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Activity Level */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-mid text-sm">רמת פעילות</label>
            <select
              value={form.activity_level}
              onChange={(e) => setForm((p) => ({ ...p, activity_level: e.target.value }))}
              required
              className="input-volt"
            >
              <option value="" disabled>בחר רמת פעילות</option>
              {ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label} ({opt.desc})</option>
              ))}
            </select>
          </div>

          {/* Equipment */}
          <div className="flex flex-col gap-2">
            <label className="text-text-mid text-sm">ציוד זמין</label>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleEquipmentToggle(item)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    form.equipment.includes(item)
                      ? "bg-volt-soft border-volt/40 text-volt font-medium"
                      : "bg-white/4 border-line text-text-mid hover:border-volt/30 hover:text-text-hi"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Meals per day */}
          <div className="flex flex-col gap-2">
            <label className="text-text-mid text-sm">מספר ארוחות ביום</label>
            <div className="flex gap-2">
              {[3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, meals_per_day: n }))}
                  className={`flex-1 py-2 rounded-elem border text-sm font-medium transition-colors tabular-nums ${
                    form.meals_per_day === n
                      ? "bg-volt-soft border-volt/40 text-volt"
                      : "bg-white/4 border-line text-text-mid hover:border-volt/30 hover:text-text-hi"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Medical + Injuries + Allergies */}
          <div className="grid grid-cols-1 gap-4">
            {[
              { key: "medical_conditions", label: "מצבים רפואיים" },
              { key: "injuries", label: "פציעות" },
              { key: "allergies", label: "אלרגיות" },
            ].map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-text-mid text-sm">{label}</label>
                <textarea
                  rows={2}
                  value={form[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="input-volt resize-none placeholder:italic"
                  placeholder={`הכנס ${label}...`}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-coral-soft border border-coral/30 text-coral rounded-elem px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.activity_level || !form.goal}
            className="btn-volt w-full py-3 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "שומר..." : "שמור שינויים"}
          </button>
        </form>
      </div>

      {/* CTA banner → workouts */}
      <button
        onClick={() => navigate('/workouts')}
        className="anim-rise anim-d3 relative rounded-card overflow-hidden h-40 w-full text-right group ring-1 ring-line"
      >
        <img
          src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=400&fit=crop&q=80"
          alt="חדר כושר"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-ink/90 via-ink/50 to-transparent flex items-center justify-between px-6">
          <div>
            <p className="text-text-hi text-lg font-extrabold">המסע שלך מתחיל כאן</p>
            <p className="text-text-mid text-xs mt-1 inline-flex items-center gap-1">
              מעבר לתכנית האימונים שלך
              <ArrowLeft className="w-3.5 h-3.5 text-volt" />
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}
