import { useState, useEffect } from 'react'
import { X, Loader2, Sun, Soup, Moon, Apple } from 'lucide-react'
import { nutritionAPI } from '../services/api'

const MEAL_NAMES = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'חטיף',
}

const MEAL_ICONS = {
  breakfast: { Icon: Sun, bg: 'bg-amber-soft', color: 'text-amber' },
  lunch: { Icon: Soup, bg: 'bg-coral-soft', color: 'text-coral' },
  dinner: { Icon: Moon, bg: 'bg-cyan-soft', color: 'text-cyan' },
  snack: { Icon: Apple, bg: 'bg-volt-soft', color: 'text-volt' },
}

function formatDateHe(dateStr) {
  return new Date(dateStr).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function FoodLogDayModal({ date, onClose }) {
  const [logs, setLogs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    nutritionAPI.getDayLog(date)
      .then(({ data }) => setLogs(data || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [date])

  const byMeal = (logs || []).reduce((acc, log) => {
    const key = log.meal_type || 'snack'
    acc[key] = acc[key] || []
    acc[key].push(log)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface-2 border border-line-strong rounded-card w-full max-w-sm p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-text-hi font-bold">{formatDateHe(date)}</h3>
          <button onClick={onClose} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex justify-center items-center gap-2 h-32 text-text-mid text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-volt" /> טוען...
          </div>
        )}

        {!loading && error && (
          <p className="text-coral text-sm text-center py-6">לא הצלחנו לטעון את פרטי היום</p>
        )}

        {!loading && !error && (logs || []).length === 0 && (
          <p className="text-text-mid text-sm text-center py-6">לא נרשמו ארוחות ביום הזה</p>
        )}

        {!loading && !error && Object.entries(byMeal).map(([mealType, items]) => {
          const { Icon: MealIcon, bg: mealBg, color: mealColor } = MEAL_ICONS[mealType] || MEAL_ICONS.snack
          return (
            <div key={mealType} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full ${mealBg} ${mealColor} flex items-center justify-center shrink-0`}>
                  <MealIcon className="w-3.5 h-3.5" />
                </span>
                <p className="text-text-hi text-sm font-semibold">{MEAL_NAMES[mealType] || mealType}</p>
              </div>
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm px-1">
                    <span className="text-text-mid truncate">{item.food_name}</span>
                    <span className="text-text-hi tabular-nums shrink-0" dir="ltr">{item.calories} קל'</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
