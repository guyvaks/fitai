import { useState, useEffect } from "react";
import api from "../services/api";
import MetricCard from "../components/ui/MetricCard";
import BMIMeter from "../components/ui/BMIMeter";

const ACTIVITY_OPTIONS = [
  { value: "sedentary", label: "מושבי", desc: "ללא פעילות גופנית", icon: "🪑" },
  { value: "lightly_active", label: "קל", desc: "1-3 ימים בשבוע", icon: "🚶" },
  { value: "moderately_active", label: "בינוני", desc: "3-5 ימים בשבוע", icon: "🏃" },
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

export default function Profile() {
  const [form, setForm] = useState(defaultForm);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [fetchingProfile, setFetchingProfile] = useState(true);

  // Load existing profile on mount
  useEffect(() => {
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
      .catch(() => {})
      .finally(() => setFetchingProfile(false));
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
      <div className="flex justify-center items-center h-40 text-text-muted">
        טוען פרופיל...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto" dir="rtl">
      <h2 className="text-2xl font-bold text-text-main">פרופיל ומדדים</h2>

      {/* Metrics Section */}
      {saved && metrics && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-main border-b border-slate-700 pb-2">
            המדדים שלך
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              title="BMI — מדד מסת גוף"
              value={metrics.bmi}
              subtitle={metrics.bmi_category}
              color={
                metrics.bmi < 18.5
                  ? "text-blue-400"
                  : metrics.bmi < 25
                  ? "text-green-400"
                  : metrics.bmi < 30
                  ? "text-yellow-400"
                  : "text-red-400"
              }
            />
            <MetricCard
              title="BMR — קלוריות בסיסיות"
              value={metrics.bmr?.toLocaleString()}
              unit='קק"ל'
              subtitle="קלוריות בסיסיות ביום"
              color="text-blue-400"
            />
            <MetricCard
              title="TDEE — סה״כ קלוריות"
              value={metrics.tdee?.toLocaleString()}
              unit='קק"ל'
              subtitle="כולל פעילות גופנית"
              color="text-cyan-400"
            />
            <MetricCard
              title="יעד קלוריות"
              value={metrics.target_calories?.toLocaleString()}
              unit='קק"ל'
              subtitle={GOAL_LABELS[metrics.goal] || metrics.goal}
              color="text-primary"
            />
          </div>

          {/* BMI Meter */}
          <div className="bg-surface rounded-card p-5">
            <h4 className="text-text-main font-medium mb-4">מד BMI</h4>
            <BMIMeter bmi={metrics.bmi} category={metrics.bmi_category} />
          </div>
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <h3 className="text-lg font-semibold text-text-main border-b border-slate-700 pb-2">
          נתוני משתמש
        </h3>

        {/* Age + Gender */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-sm">גיל</label>
            <input
              type="number"
              min="10"
              max="120"
              required
              value={form.age}
              onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
              className="bg-slate-800 border border-slate-600 rounded-elem px-3 py-2 text-text-main focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-sm">מין</label>
            <div className="flex gap-2 mt-1">
              {[{ value: "male", label: "זכר" }, { value: "female", label: "נקבה" }].map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, gender: g.value }))}
                  className={`flex-1 py-2 rounded-elem border text-sm font-medium transition-colors ${
                    form.gender === g.value
                      ? "bg-primary border-primary text-white"
                      : "bg-slate-800 border-slate-600 text-text-muted hover:border-primary"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Height + Weight + Target */}
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-sm">גובה ס״מ</label>
            <input
              type="number"
              min="100"
              max="250"
              required
              value={form.height_cm}
              onChange={(e) => setForm((p) => ({ ...p, height_cm: e.target.value }))}
              className="bg-slate-800 border border-slate-600 rounded-elem px-3 py-2 text-text-main focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-sm">משקל נוכחי ק״ג</label>
            <input
              type="number"
              min="20"
              max="300"
              step="0.1"
              required
              value={form.weight_kg}
              onChange={(e) => setForm((p) => ({ ...p, weight_kg: e.target.value }))}
              className="bg-slate-800 border border-slate-600 rounded-elem px-3 py-2 text-text-main focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-text-muted text-sm">משקל יעד ק״ג</label>
            <input
              type="number"
              min="20"
              max="300"
              step="0.1"
              value={form.target_weight_kg}
              onChange={(e) => setForm((p) => ({ ...p, target_weight_kg: e.target.value }))}
              className="bg-slate-800 border border-slate-600 rounded-elem px-3 py-2 text-text-main focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Activity Level */}
        <div className="flex flex-col gap-2">
          <label className="text-text-muted text-sm">רמת פעילות</label>
          <div className="grid grid-cols-1 gap-2">
            {ACTIVITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm((p) => ({ ...p, activity_level: opt.value }))}
                className={`flex items-center gap-3 px-4 py-3 rounded-elem border text-right transition-colors ${
                  form.activity_level === opt.value
                    ? "bg-primary/20 border-primary"
                    : "bg-slate-800 border-slate-600 hover:border-slate-500"
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <div>
                  <div className="text-text-main text-sm font-medium">{opt.label}</div>
                  <div className="text-text-muted text-xs">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Goal */}
        <div className="flex flex-col gap-2">
          <label className="text-text-muted text-sm">מטרה</label>
          <div className="grid grid-cols-2 gap-2">
            {GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm((p) => ({ ...p, goal: opt.value }))}
                className={`flex items-center gap-2 px-4 py-3 rounded-elem border text-right transition-colors ${
                  form.goal === opt.value
                    ? "bg-primary/20 border-primary"
                    : "bg-slate-800 border-slate-600 hover:border-slate-500"
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className="text-text-main text-sm font-medium">{opt.label}</span>
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
              <label className="text-text-muted text-sm">{label}</label>
              <textarea
                rows={2}
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                className="bg-slate-800 border border-slate-600 rounded-elem px-3 py-2 text-text-main focus:outline-none focus:border-primary resize-none text-sm"
                placeholder={`הכנס ${label.toLowerCase()}...`}
              />
            </div>
          ))}
        </div>

        {/* Equipment */}
        <div className="flex flex-col gap-2">
          <label className="text-text-muted text-sm">ציוד זמין</label>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleEquipmentToggle(item)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  form.equipment.includes(item)
                    ? "bg-primary border-primary text-white"
                    : "bg-slate-800 border-slate-600 text-text-muted hover:border-primary"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Meals per day */}
        <div className="flex flex-col gap-2">
          <label className="text-text-muted text-sm">מספר ארוחות ביום</label>
          <div className="flex gap-2">
            {[3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setForm((p) => ({ ...p, meals_per_day: n }))}
                className={`flex-1 py-2 rounded-elem border text-sm font-medium transition-colors ${
                  form.meals_per_day === n
                    ? "bg-primary border-primary text-white"
                    : "bg-slate-800 border-slate-600 text-text-muted hover:border-primary"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500 text-red-400 rounded-elem px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !form.activity_level || !form.goal}
          className="w-full bg-primary hover:bg-green-400 text-white font-semibold py-3 rounded-elem transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "שומר..." : saved ? "עדכן פרופיל וחשב מחדש" : "שמור פרופיל וחשב מדדים"}
        </button>
      </form>
    </div>
  );
}
