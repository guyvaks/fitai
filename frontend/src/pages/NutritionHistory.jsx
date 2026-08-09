import { useState, useEffect } from 'react'
import { nutritionAPI } from '../services/api'
import { Loader2, Utensils, ChevronLeft } from 'lucide-react'
import { TrendChart, PERIOD_DAYS } from '../components/TrendChart'
import FoodLogDayModal from '../components/FoodLogDayModal'

function buildCalorieSeriesByPeriod(history) {
  const series = {}
  for (const [period, days] of Object.entries(PERIOD_DAYS)) {
    const cutoff = Date.now() - days * 86400000
    series[period] = history
      .filter((e) => new Date(e.date).getTime() >= cutoff)
      .map((e) => ({
        label: new Date(e.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
        value: e.calories,
      }))
  }
  return series
}

function calorieChangeLabel(series) {
  if (series.length < 2) return { text: '', positive: true }
  const first = series[0].value
  const last = series[series.length - 1].value
  if (!first) return { text: '', positive: true }
  const pct = ((last - first) / first) * 100
  const sign = pct > 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(0)}%`, positive: pct <= 0 }
}

export default function NutritionHistory() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [openDate, setOpenDate] = useState(null)

  useEffect(() => {
    nutritionAPI.getHistory(90)
      .then(({ data }) => setHistory(data || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false))
  }, [])

  const calorieSeriesByPeriod = buildCalorieSeriesByPeriod(history)
  const daysDesc = [...history].reverse()

  return (
    <div className="space-y-6" dir="rtl">
      <TrendChart
        title="קלוריות יומיות"
        unit=" קק״ל"
        data={calorieSeriesByPeriod}
        color="var(--color-volt)"
        gradientId="nutritionCaloriesGradient"
        changeLabel={calorieChangeLabel}
      />

      <div>
        <h2 className="text-lg font-bold text-text-hi mb-3 flex items-center gap-2">
          <Utensils className="w-5 h-5 text-volt" /> ימים אחרונים
        </h2>
        {loading ? (
          <p className="text-text-mid text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-volt" /> טוען...</p>
        ) : daysDesc.length === 0 ? (
          <p className="text-text-mid text-sm">עדיין לא נרשמו ארוחות</p>
        ) : (
          <div className="space-y-2">
            {daysDesc.map((d) => (
              <button
                key={d.date}
                onClick={() => setOpenDate(d.date)}
                className="w-full card-glass card-hover p-4 flex items-center justify-between gap-3 text-right"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-text-hi font-medium text-sm">
                    {new Date(d.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-text-mid text-xs" dir="ltr">
                    <span className="tabular-nums">{Math.round(d.calories)} קק״ל</span>
                    <span className="tabular-nums">{Math.round(d.protein)}g חלבון</span>
                    <span className="tabular-nums">{Math.round(d.carbs)}g פחמ׳</span>
                    <span className="tabular-nums">{Math.round(d.fat)}g שומן</span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-text-low shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {openDate && (
        <FoodLogDayModal date={openDate} onClose={() => setOpenDate(null)} />
      )}
    </div>
  )
}
