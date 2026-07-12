import { useState, useEffect } from 'react'
import { nutritionAPI } from '../services/api'
import FoodSearch from './FoodSearch'
import { X, Plus, Loader2, Sunrise, Sun, Moon, Apple } from 'lucide-react'

const DAYS = [
  { key: 'sunday', label: 'ראשון' },
  { key: 'monday', label: 'שני' },
  { key: 'tuesday', label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday', label: 'חמישי' },
  { key: 'friday', label: 'שישי' },
  { key: 'saturday', label: 'שבת' },
]

const MEAL_TYPES = [
  { key: 'breakfast', label: 'בוקר', Icon: Sunrise },
  { key: 'lunch',     label: 'צהריים', Icon: Sun },
  { key: 'dinner',    label: 'ערב', Icon: Moon },
  { key: 'snack',     label: 'ביניים', Icon: Apple },
]

function round1(n) {
  return Math.round(n * 10) / 10
}

export default function ManualPlanModal({ onClose, onSaved }) {
  const [activeDay, setActiveDay] = useState('sunday')
  const [activeMeal, setActiveMeal] = useState('breakfast')
  const [week, setWeek] = useState({}) // { [day]: { [mealType]: items[] } }
  const [selectedFood, setSelectedFood] = useState(null)
  const [qty, setQty] = useState('100')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Load the existing active plan so edits merge onto it instead of replacing it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await nutritionAPI.getPlan()
        const mealPlan = data?.plan_data?.meal_plan || {}
        const loaded = {}
        for (const [day, meals] of Object.entries(mealPlan)) {
          const dayMeals = {}
          for (const meal of meals) {
            dayMeals[meal.meal_type] = meal.items || []
          }
          loaded[day] = dayMeals
        }
        if (!cancelled) setWeek(loaded)
      } catch (e) {
        // 404 = no active plan yet; start from empty, anything else is non-fatal here.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const dayMeal = week[activeDay]?.[activeMeal] || []

  const totalItemCount = Object.values(week).reduce(
    (sum, meals) => sum + Object.values(meals).reduce((s, items) => s + items.length, 0),
    0
  )

  const handleFoodSelect = (food) => setSelectedFood(food)

  const handleAddItem = () => {
    if (!selectedFood) return
    const qtyNum = parseFloat(qty) || 0
    if (qtyNum <= 0) return
    const factor = qtyNum / 100
    const item = {
      name: selectedFood.name,
      qty_g: qtyNum,
      calories: round1(selectedFood.calories * factor),
      protein: round1(selectedFood.protein * factor),
      carbs: round1(selectedFood.carbs * factor),
      fat: round1(selectedFood.fat * factor),
    }
    setWeek(w => {
      const dayMeals = w[activeDay] || {}
      const items = dayMeals[activeMeal] || []
      return {
        ...w,
        [activeDay]: { ...dayMeals, [activeMeal]: [...items, item] },
      }
    })
    setSelectedFood(null)
    setQty('100')
  }

  const handleRemoveItem = (idx) => {
    setWeek(w => {
      const dayMeals = w[activeDay] || {}
      const items = (dayMeals[activeMeal] || []).filter((_, i) => i !== idx)
      return { ...w, [activeDay]: { ...dayMeals, [activeMeal]: items } }
    })
  }

  const handleSave = async () => {
    setError(null)
    if (totalItemCount === 0) {
      setError('נא להוסיף לפחות פריט מזון אחד לתפריט')
      return
    }
    setSaving(true)
    try {
      const payload = {}
      for (const [day, meals] of Object.entries(week)) {
        const dayMeals = Object.entries(meals)
          .filter(([, items]) => items.length > 0)
          .map(([meal_type, items]) => ({ meal_type, items }))
        if (dayMeals.length > 0) payload[day] = dayMeals
      }
      await nutritionAPI.createManualPlan(payload)
      onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשמירת התפריט')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-surface-2 border border-line-strong rounded-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl anim-rise">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-hi">בניית תפריט שבועי ידני</h3>
          <button onClick={onClose} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור"><X className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="bg-coral-soft border border-coral/30 rounded-card p-3 text-coral text-sm">
            {error}
          </div>
        )}

        {/* Day tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {DAYS.map(d => {
            const dayItemCount = Object.values(week[d.key] || {}).reduce((s, items) => s + items.length, 0)
            return (
              <button
                key={d.key}
                onClick={() => setActiveDay(d.key)}
                className={`px-3 py-2 rounded-elem text-sm font-medium whitespace-nowrap transition ${
                  activeDay === d.key
                    ? 'bg-volt text-ink'
                    : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
                }`}
              >
                {d.label}{dayItemCount > 0 && <span className="mr-1 opacity-70" dir="ltr">({dayItemCount})</span>}
              </button>
            )
          })}
        </div>

        {/* Meal type tabs */}
        <div className="flex gap-2 flex-wrap">
          {MEAL_TYPES.map(m => (
            <button
              key={m.key}
              onClick={() => setActiveMeal(m.key)}
              className={`px-3 py-1.5 rounded-elem text-sm font-medium transition inline-flex items-center gap-1.5 ${
                activeMeal === m.key
                  ? 'bg-volt text-ink'
                  : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
              }`}
            >
              <m.Icon className="w-3.5 h-3.5" /> {m.label}
            </button>
          ))}
        </div>

        {/* Food search + add */}
        <div className="grid grid-cols-2 gap-3">
          <FoodSearch onSelect={handleFoodSelect} />

          {selectedFood && (
            <div className="col-span-2 flex items-center gap-2 bg-volt-soft border border-volt/25 rounded-elem px-3 py-2 flex-wrap">
              <span className="text-volt text-sm font-medium">{selectedFood.name}</span>
              <span className="text-text-mid text-xs">לכל 100ג׳: <span dir="ltr">{selectedFood.calories}</span> קק״ל</span>
              <div className="flex items-center gap-2 mr-auto">
                <label className="text-text-mid text-xs">כמות (גרם)</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="w-20 bg-white/6 border border-line-strong rounded-elem px-2 py-1 text-text-hi text-sm focus:outline-none focus:border-volt/60"
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="bg-volt text-ink px-3 py-1 rounded-elem text-xs font-bold hover:brightness-105 active:scale-95 transition inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> הוסף
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Current meal items */}
        <div className="space-y-2">
          <h4 className="text-text-hi font-bold text-sm">
            {DAYS.find(d => d.key === activeDay)?.label} · {MEAL_TYPES.find(m => m.key === activeMeal)?.label}
          </h4>
          {dayMeal.length === 0 ? (
            <p className="text-text-mid text-sm text-center py-3 bg-white/4 border border-line rounded-elem">אין פריטים עדיין</p>
          ) : (
            <div className="space-y-1.5">
              {dayMeal.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-white/4 border border-line rounded-elem px-3 py-2">
                  <span className="text-text-hi text-sm">{item.name} (<span dir="ltr">{item.qty_g}g</span>)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-text-mid text-xs"><span dir="ltr">{item.calories}</span> קק"ל</span>
                    <button
                      onClick={() => handleRemoveItem(i)}
                      className="text-text-mid hover:text-coral transition p-1"
                      aria-label="הסר"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-volt flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'שומר...' : <>שמור תפריט (<span dir="ltr">{totalItemCount}</span> פריטים)</>}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-elem text-sm font-medium border border-line text-text-mid hover:text-text-hi hover:bg-white/6 transition"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
