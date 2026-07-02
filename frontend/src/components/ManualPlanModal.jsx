import { useState } from 'react'
import { nutritionAPI } from '../services/api'
import FoodSearch from './FoodSearch'

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
  { key: 'breakfast', label: 'בוקר', icon: '🌅' },
  { key: 'lunch',     label: 'צהריים', icon: '☀️' },
  { key: 'dinner',    label: 'ערב', icon: '🌙' },
  { key: 'snack',     label: 'ביניים', icon: '🍎' },
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-dark-text">בניית תפריט שבועי ידני</h3>
          <button onClick={onClose} className="text-dark-text-muted hover:text-dark-text text-xl px-1">×</button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-card p-3 text-red-600 text-sm">
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
                className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  activeDay === d.key
                    ? 'bg-accent-blue text-white'
                    : 'bg-white border border-light-border text-dark-text-muted hover:text-dark-text'
                }`}
              >
                {d.label}{dayItemCount > 0 && <span className="mr-1 opacity-70">({dayItemCount})</span>}
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
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                activeMeal === m.key
                  ? 'bg-accent-blue text-white'
                  : 'bg-white border border-light-border text-dark-text-muted hover:text-dark-text'
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Food search + add */}
        <div className="grid grid-cols-2 gap-3">
          <FoodSearch onSelect={handleFoodSelect} />

          {selectedFood && (
            <div className="col-span-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex-wrap">
              <span className="text-accent-blue text-sm font-medium">{selectedFood.name}</span>
              <span className="text-dark-text-muted text-xs">לכל 100ג׳: {selectedFood.calories} קק״ל</span>
              <div className="flex items-center gap-2 mr-auto">
                <label className="text-dark-text-muted text-xs">כמות (גרם)</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="w-20 bg-white border border-light-border rounded-lg px-2 py-1 text-dark-text text-sm focus:outline-none focus:border-accent-blue"
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="bg-accent-blue text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-accent-blue/90 transition"
                >
                  + הוסף
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Current meal items */}
        <div className="space-y-2">
          <h4 className="text-dark-text font-medium text-sm">
            {DAYS.find(d => d.key === activeDay)?.label} · {MEAL_TYPES.find(m => m.key === activeMeal)?.label}
          </h4>
          {dayMeal.length === 0 ? (
            <p className="text-dark-text-muted text-sm text-center py-3 bg-gray-50 rounded-lg">אין פריטים עדיין</p>
          ) : (
            <div className="space-y-1.5">
              {dayMeal.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 bg-gray-50 border border-light-border rounded-lg px-3 py-2">
                  <span className="text-dark-text text-sm">{item.name} ({item.qty_g}g)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-dark-text-muted text-xs">{item.calories} קק"ל</span>
                    <button
                      onClick={() => handleRemoveItem(i)}
                      className="text-dark-text-muted hover:text-red-600 transition text-lg px-1"
                    >
                      ×
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
            className="flex-1 bg-accent-blue text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-accent-blue/90 disabled:opacity-50 transition shadow-sm"
          >
            {saving ? 'שומר...' : `שמור תפריט (${totalItemCount} פריטים)`}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-light-border text-dark-text-muted hover:text-dark-text transition"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
