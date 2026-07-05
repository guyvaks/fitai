import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import BMIMeter from "../components/ui/BMIMeter";

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "מושבי", desc: "ללא פעילות גופנית", icon: "🪑" },
  { value: "lightly_active", label: "פעיל קלות", desc: "1-3 אימונים בשבוע", icon: "🚶" },
  { value: "moderately_active", label: "פעיל בינוני", desc: "3-5 ימים בשבוע", icon: "🏃" },
  { value: "very_active", label: "פעיל מאוד", desc: "6-7 ימים בשבוע", icon: "⚡" },
  { value: "extra_active", label: "ספורטאי", desc: "פעילות אינטנסיבית פעמיים ביום", icon: "🏆" },
];

const GOAL_OPTIONS = [
  { value: "weight_loss", label: "ירידה במשקל", icon: "📉" },
  { value: "muscle_gain", label: "עלייה בשריר", icon: "💪" },
  { value: "maintenance", label: "שמירה על משקל", icon: "⚖️" },
  { value: "fitness_improvement", label: "שיפור כושר", icon: "🏅" },
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
  { key: "fat", label: "שומן", pct: 25, color: "#F97316" },
  { key: "carbs", label: "פחמימות", pct: 45, color: "#22C55E" },
  { key: "protein", label: "חלבון", pct: 30, color: "#2563EB" },
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth="6" />
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
  const [form, setForm] = useState(defaultForm);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [fetchingProfile, setFetchingProfile] = useState(true);
  const [profileError, setProfileError] = useState(false);

  const loadProfile = () => {
    setFetchingProfile(true);
    setProfileError(false);
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
        // 404 just means the user hasn't saved a profile yet — not an error state
        if (err.response?.status !== 404) {
          setProfileError(true);
        }
      })
      .finally(() => setFetchingProfile(false));
  };

  // Load existing profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

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
      <div className="flex justify-center items-center h-40 text-dark-text-muted bg-light-bg rounded-card">
        טוען פרופיל...
      </div>
    );
  }

  if (profileError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 h-40 bg-red-50 border border-red-200 rounded-card text-center p-6"
        dir="rtl"
      >
        <p className="text-red-600 text-sm font-medium">לא הצלחנו לטעון את הפרופיל</p>
        <button
          onClick={loadProfile}
          className="bg-accent-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent-blue/90 transition shadow-sm"
        >
          נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold text-dark-text">פרופיל ומדדים</h2>
        <p className="text-dark-text-muted mt-1">עדכן את הנתונים האישיים שלך לקבלת תוכנית מותאמת אישית</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Metrics analysis (left side in RTL) */}
        <div className="space-y-6 lg:order-2">
          {saved && metrics ? (
            <>
              <div className="bg-white border border-light-border rounded-card p-5 shadow-sm space-y-4">
                <h3 className="text-dark-text font-semibold">ניתוח מדדים</h3>
                <BMIMeter bmi={metrics.bmi} category={metrics.bmi_category} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-dark-text-muted text-xs">TDEE</div>
                    <div className="text-dark-text text-xl font-bold">{metrics.tdee?.toLocaleString() ?? "—"}</div>
                    <div className="text-dark-text-muted text-xs">קלוריות</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-dark-text-muted text-xs">BMR</div>
                    <div className="text-dark-text text-xl font-bold">{metrics.bmr?.toLocaleString() ?? "—"}</div>
                    <div className="text-dark-text-muted text-xs">קלוריות</div>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-dark-text-muted text-xs">יעד קלוריות יומי</div>
                    <div className="text-accent-blue text-xl font-bold">{metrics.target_calories?.toLocaleString() ?? "—"}</div>
                    <div className="text-dark-text-muted text-xs">קלוריות ליום</div>
                  </div>
                  <span className="text-2xl">🎯</span>
                </div>
                <p className="text-dark-text-muted text-xs leading-relaxed bg-blue-50 rounded-lg p-3">
                  <span className="font-semibold text-accent-blue">טיפ: </span>
                  בהתבסס על ה-TDEE שלך, יעד של {metrics.target_calories?.toLocaleString()} קלוריות יאפשר לך {GOAL_LABELS[metrics.goal] || "התקדמות"} בקצב בריא.
                </p>
              </div>

              <div className="bg-white border border-light-border rounded-card p-5 shadow-sm">
                <h3 className="text-dark-text font-semibold mb-4">הרכב יעד תזונתי</h3>
                <div className="flex justify-around">
                  {MACRO_SPLIT.map((m) => (
                    <div key={m.key} className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <MacroRing pct={m.pct} color={m.color} />
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-dark-text">
                          {m.pct}%
                        </div>
                      </div>
                      <span className="text-dark-text-muted text-xs">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border border-light-border rounded-card p-5 shadow-sm text-center text-dark-text-muted text-sm">
              מלא את הפרטים ושמור כדי לראות ניתוח מדדים
            </div>
          )}
        </div>

        {/* Form (right side in RTL) */}
        <form onSubmit={handleSubmit} className="bg-white border border-light-border rounded-card p-6 shadow-sm space-y-6 lg:order-1">
          {/* Age + Gender */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-dark-text-muted text-sm">גיל</label>
              <input
                type="number"
                min="10"
                max="120"
                required
                value={form.age}
                onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
                className="bg-gray-50 border border-light-border rounded-lg px-3 py-2.5 text-dark-text focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-dark-text-muted text-sm">מין</label>
              <select
                value={form.gender}
                onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
                className="bg-gray-50 border border-light-border rounded-lg px-3 py-2.5 text-dark-text focus:outline-none focus:border-accent-blue"
              >
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
          </div>

          {/* Height + Weight + Target */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-dark-text-muted text-sm">גובה (ס״מ)</label>
              <input
                type="number"
                min="100"
                max="250"
                required
                value={form.height_cm}
                onChange={(e) => setForm((p) => ({ ...p, height_cm: e.target.value }))}
                className="bg-gray-50 border border-light-border rounded-lg px-3 py-2.5 text-dark-text focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-dark-text-muted text-sm">משקל (ק״ג)</label>
              <input
                type="number"
                min="20"
                max="300"
                step="0.1"
                required
                value={form.weight_kg}
                onChange={(e) => setForm((p) => ({ ...p, weight_kg: e.target.value }))}
                className="bg-gray-50 border border-light-border rounded-lg px-3 py-2.5 text-dark-text focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-dark-text-muted text-sm">משקל יעד (ק״ג)</label>
              <input
                type="number"
                min="20"
                max="300"
                step="0.1"
                value={form.target_weight_kg}
                onChange={(e) => setForm((p) => ({ ...p, target_weight_kg: e.target.value }))}
                className="bg-gray-50 border border-light-border rounded-lg px-3 py-2.5 text-dark-text focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          {/* Goal */}
          <div className="flex flex-col gap-1">
            <label className="text-dark-text-muted text-sm">מטרה</label>
            <select
              value={form.goal}
              onChange={(e) => setForm((p) => ({ ...p, goal: e.target.value }))}
              required
              className="bg-gray-50 border border-light-border rounded-lg px-3 py-2.5 text-dark-text focus:outline-none focus:border-accent-blue"
            >
              <option value="" disabled>בחר מטרה</option>
              {GOAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
              ))}
            </select>
          </div>

          {/* Activity Level */}
          <div className="flex flex-col gap-1">
            <label className="text-dark-text-muted text-sm">רמת פעילות</label>
            <select
              value={form.activity_level}
              onChange={(e) => setForm((p) => ({ ...p, activity_level: e.target.value }))}
              required
              className="bg-gray-50 border border-light-border rounded-lg px-3 py-2.5 text-dark-text focus:outline-none focus:border-accent-blue"
            >
              <option value="" disabled>בחר רמת פעילות</option>
              {ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.icon} {opt.label} ({opt.desc})</option>
              ))}
            </select>
          </div>

          {/* Equipment */}
          <div className="flex flex-col gap-2">
            <label className="text-dark-text-muted text-sm">ציוד זמין</label>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleEquipmentToggle(item)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    form.equipment.includes(item)
                      ? "bg-accent-blue border-accent-blue text-white"
                      : "bg-white border-light-border text-dark-text-muted hover:border-accent-blue"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Meals per day */}
          <div className="flex flex-col gap-2">
            <label className="text-dark-text-muted text-sm">מספר ארוחות ביום</label>
            <div className="flex gap-2">
              {[3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, meals_per_day: n }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    form.meals_per_day === n
                      ? "bg-accent-blue border-accent-blue text-white"
                      : "bg-white border-light-border text-dark-text-muted hover:border-accent-blue"
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
              <div key={key} className="flex flex-col gap-1">
                <label className="text-dark-text-muted text-sm">{label}</label>
                <textarea
                  rows={2}
                  value={form[key]}
                  onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  className="bg-gray-50 border border-light-border rounded-lg px-3 py-2 text-dark-text placeholder-dark-text-muted placeholder:italic focus:outline-none focus:border-accent-blue resize-none text-sm"
                  placeholder={`הכנס ${label}...`}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.activity_level || !form.goal}
            className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? "שומר..." : "שמור שינויים"}
          </button>
        </form>
      </div>

      {/* CTA banner → workouts */}
      <button
        onClick={() => navigate('/workouts')}
        className="relative rounded-card overflow-hidden h-40 shadow-sm w-full text-right group"
      >
        <img
          src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=400&fit=crop&q=80"
          alt="חדר כושר"
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-black/70 to-transparent flex items-center justify-between px-6">
          <div>
            <p className="text-white text-lg font-bold">המסע שלך מתחיל כאן</p>
            <p className="text-white/80 text-xs mt-1">מעבר לתכנית האימונים שלך ←</p>
          </div>
        </div>
      </button>
    </div>
  );
}
