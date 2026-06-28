import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  "תת משקל": "text-blue-400",
  "משקל תקין": "text-green-400",
  "עודף משקל": "text-yellow-400",
  "השמנה": "text-red-400",
};

export default function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [hasPendingSuggestion, setHasPendingSuggestion] = useState(false);
  const firstName = user?.full_name?.split(" ")[0] || "משתמש";

  useEffect(() => {
    agentsAPI.getPending()
      .then(r => setHasPendingSuggestion(r.data?.length > 0))
      .catch(() => {});
  }, []);

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
      color: bmi ? (BMI_CATEGORY_COLOR[bmiCategory] || "text-primary") : "text-text-muted",
    },
    {
      label: "חלבון",
      value: "142",
      unit: "גרם",
      icon: "🥩",
      color: "text-blue-400",
    },
    {
      label: "שתייה",
      value: "1.8",
      unit: "ליטר",
      icon: "💧",
      color: "text-cyan-400",
    },
    {
      label: "אימון הבא",
      value: "כפות ידיים",
      unit: "מחר",
      icon: "💪",
      color: "text-primary",
    },
    {
      label: "TDEE",
      value: profile?.tdee ? profile.tdee.toLocaleString() : "—",
      unit: 'קק"ל',
      icon: "🫀",
      color: "text-red-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-text-main">
          ברוך הבא, {firstName}! 👋
        </h2>
        <p className="text-text-muted mt-1">הנה סיכום היום שלך</p>
      </div>

      {/* AI pending suggestion banner */}
      {hasPendingSuggestion && (
        <div
          onClick={() => navigate('/ai-suggestion')}
          className="bg-primary/10 border border-primary/30 rounded-card p-4 text-sm text-primary cursor-pointer hover:bg-primary/20 transition flex items-center justify-between"
        >
          <span>🤖 AI הכין לך תכנית חדשה! לחץ לצפייה ואישור</span>
          <span>←</span>
        </div>
      )}

      {/* No profile banner */}
      {!profile && (
        <div className="bg-primary/10 border border-primary/30 rounded-card p-4 text-sm text-primary">
          💡 עדיין לא הגדרת פרופיל אישי. עבור ל<a href="/profile" className="underline font-medium">דף הפרופיל</a> כדי לראות נתונים אישיים.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-surface rounded-card p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-sm">{card.label}</span>
              <span className="text-2xl">{card.icon}</span>
            </div>
            <div>
              <span className={`text-2xl font-bold ${card.color}`}>
                {card.value}
              </span>
              {card.unit && (
                <span className="text-text-muted text-xs mr-1">{card.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI suggestion */}
      <div className="bg-surface rounded-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🤖</span>
          <h3 className="text-text-main font-semibold">המלצת AI היום</h3>
        </div>
        <p className="text-text-muted text-sm leading-relaxed">
          על בסיס ביצועי האימון האחרון שלך, מומלץ להוסיף 5% משקל לתרגיל הסקוואט.
          גם שים לב שצריכת החלבון שלך ירדה ב-3 ימים האחרונים — נסה לשלב ארוחת ביניים עם גבינת קוטג'.
        </p>
        <button className="mt-3 text-primary text-sm font-medium hover:underline">
          צפה בכל ההמלצות ←
        </button>
      </div>

      {/* Weekly calories chart */}
      <div className="bg-surface rounded-card p-5">
        <h3 className="text-text-main font-semibold mb-4">קלוריות שבועיות</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeklyData} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "#94A3B8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#94A3B8", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={[0, 2500]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0F172A",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#F8FAFC",
              }}
              formatter={(value) => [`${value} קק"ל`, "קלוריות"]}
            />
            <Bar dataKey="calories" fill="#22C55E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
