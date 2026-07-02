import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { agentsAPI } from "../services/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const weeklyData = [
  { day: "ראש", calories: 1850 },
  { day: "שני", calories: 2100 },
  { day: "שלש", calories: 1950 },
  { day: "רבע", calories: 2200 },
  { day: "חמש", calories: 1800 },
  { day: "שיש", calories: 2300 },
  { day: "שבת", calories: 1700 },
];

const BMI_CATEGORY_COLOR = {
  "תת משקל": "text-blue-600",
  "משקל תקין": "text-green-600",
  "עודף משקל": "text-yellow-600",
  "השמנה": "text-red-600",
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasPendingSuggestion, setHasPendingSuggestion] = useState(false);
  const [fullPlanLoading, setFullPlanLoading] = useState(false);
  const [fullPlanError, setFullPlanError] = useState(null);
  const firstName = user?.full_name?.split(" ")[0] || "משתמש";
  const greeting = profile?.gender === 'female' ? `ברוכה הבאה, ${firstName}!` : `ברוך הבא, ${firstName}!`;

  useEffect(() => {
    agentsAPI.getPending()
      .then(r => setHasPendingSuggestion((r.data?.length ?? 0) > 0))
      .catch(() => setHasPendingSuggestion(false));
  }, [location.pathname]);

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
  const bmiCategory = profile?.bmi_category;

  const summaryCards = [
    {
      label: "קלוריות היום",
      value: targetCal ? `0 / ${targetCal.toLocaleString()}` : "—",
      unit: 'קק"ל',
      icon: "🔥",
      color: "text-orange-400",
    },
    {
      label: "BMI",
      value: bmi ?? "—",
      unit: bmiCategory ?? "",
      icon: "⚖️",
      color: bmi ? (BMI_CATEGORY_COLOR[bmiCategory] || "text-accent-blue") : "text-dark-text-muted",
    },
    {
      label: "חלבון",
      value: "142",
      unit: "גרם",
      icon: "🥩",
      color: "text-blue-600",
    },
    {
      label: "שתייה",
      value: "1.8",
      unit: "ליטר",
      icon: "💧",
      color: "text-cyan-600",
    },
    {
      label: "אימון הבא",
      value: "כפות ידיים",
      unit: "מחר",
      icon: "💪",
      color: "text-accent-blue",
    },
    {
      label: "TDEE",
      value: profile?.tdee ? profile.tdee.toLocaleString() : "—",
      unit: 'קק"ל',
      icon: "🫀",
      color: "text-red-600",
    },
  ];

  return (
    <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-dark-text">
          {greeting} 👋
        </h2>
        <p className="text-dark-text-muted mt-1">הנה סיכום היום שלך</p>
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-light-border rounded-card p-4 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <span className="text-dark-text-muted text-sm">{card.label}</span>
              <span className="text-2xl">{card.icon}</span>
            </div>
            <div>
              <span className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </span>
              {card.unit && (
                <span className="text-dark-text-muted text-xs mr-1">{card.unit}</span>
              )}
            </div>
          </div>
        ))}
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

      {/* Weekly calories chart */}
      <div className="bg-white border border-light-border rounded-card p-5 shadow-sm">
        <h3 className="text-dark-text font-semibold mb-4">קלוריות שבועיות</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeklyData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "#6B7280", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#6B7280", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 2500]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                color: "#111827",
              }}
              formatter={(value) => [`${value} קק"ל`, "קלוריות"]}
            />
            <Bar dataKey="calories" fill="#2563EB" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
