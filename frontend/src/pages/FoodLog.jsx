import { useState, useEffect } from 'react'
import { nutritionAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import FoodSearch, { CATEGORY_COLOR } from '../components/FoodSearch'

const MEAL_TYPES = [
  { value: 'breakfast', label: 'בוקר' },
  { value: 'snack1',    label: 'ביניים' },
  { value: 'lunch',     label: 'צהריים' },
  { value: 'snack2',    label: 'ביניים' },
  { value: 'dinner',    label: 'ערב' },
]

const MEAL_LABELS = {
  breakfast: 'ארוחת בוקר',
  snack1:    'ביניים (בוקר)',
  lunch:     'ארוחת צהריים',
  snack2:    'ביניים (ערב)',
  dinner:    'ארוחת ערב',
  snack:     'ביניים',
}
const MEAL_ORDER = ['breakfast', 'snack1', 'lunch', 'snack2', 'dinner', 'snack']

function toIso(date) {
  return date.toISOString().split('T')[0]
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function ProgressBar({ value, max, color = 'bg-accent-blue' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-dark-text-muted w-8 text-left">{pct}%</span>
    </div>
  )
}

function MiniRing({ value, max, color, size = 44 }) {
  const r = (size - 8) / 2
  const circumference = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-dark-text">
        {Math.round(pct)}%
      </div>
    </div>
  )
}

function RemainingRing({ consumed, target, size = 96 }) {
  const r = (size - 14) / 2
  const circumference = 2 * Math.PI * r
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3F4F6" strokeWidth="8" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2563EB" strokeWidth="8"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
      />
    </svg>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FoodLog() {
  const { profile } = useAuth()
  const [date, setDate] = useState(new Date())
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  // Selected food from DB (per 100g)
  const [selectedFood, setSelectedFood] = useState(null)

  const [form, setForm] = useState({
    food_name:  '',
    quantity_g: '100',
    calories:   '',
    protein:    '',
    carbs:      '',
    fat:        '',
    meal_type:  'breakfast',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const dateStr = toIso(date)

  // Recalculate macros whenever quantity changes
  const handleQuantityChange = (val) => {
    const qty = parseFloat(val) || 0
    if (selectedFood && qty > 0) {
      const factor = qty / 100
      setForm(f => ({
        ...f,
        quantity_g: val,
        calories: String(round1(selectedFood.calories * factor)),
        protein:  String(round1(selectedFood.protein  * factor)),
        carbs:    String(round1(selectedFood.carbs    * factor)),
        fat:      String(round1(selectedFood.fat      * factor)),
      }))
    } else {
      setForm(f => ({ ...f, quantity_g: val }))
    }
  }

  // When a food is selected from search results
  const handleFoodSelect = (food) => {
    setSelectedFood(food)
    const qty = parseFloat(form.quantity_g) || 100
    const factor = qty / 100
    setForm(f => ({
      ...f,
      food_name: food.name,
      calories:  String(round1(food.calories * factor)),
      protein:   String(round1(food.protein  * factor)),
      carbs:     String(round1(food.carbs    * factor)),
      fat:       String(round1(food.fat      * factor)),
    }))
  }

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const r = await nutritionAPI.getDayLog(dateStr)
      setLogs(r.data)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [dateStr])

  const changeDay = (delta) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    setDate(d)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.food_name || !form.calories) {
      setError('נא למלא שם מאכל וקלוריות')
      return
    }
    setSubmitting(true)
    try {
      await nutritionAPI.logFood({
        date:       dateStr,
        meal_type:  form.meal_type,
        food_name:  form.food_name,
        quantity_g: parseFloat(form.quantity_g) || 100,
        calories:   parseFloat(form.calories)   || 0,
        protein:    parseFloat(form.protein)    || 0,
        carbs:      parseFloat(form.carbs)      || 0,
        fat:        parseFloat(form.fat)        || 0,
      })
      setForm({ food_name: '', quantity_g: '100', calories: '', protein: '', carbs: '', fat: '', meal_type: form.meal_type })
      setSelectedFood(null)
      setShowAddModal(false)
      fetchLogs()
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשמירה')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await nutritionAPI.deleteLog(id)
      fetchLogs()
    } catch {}
  }

  const totals = logs.reduce((acc, l) => ({
    calories: acc.calories + (l.calories || 0),
    protein:  acc.protein  + (l.protein  || 0),
    carbs:    acc.carbs    + (l.carbs    || 0),
    fat:      acc.fat      + (l.fat      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const targets = {
    calories: profile?.target_calories || 2000,
    protein:  Math.round((profile?.target_calories || 2000) * 0.30 / 4),
    carbs:    Math.round((profile?.target_calories || 2000) * 0.45 / 4),
    fat:      Math.round((profile?.target_calories || 2000) * 0.25 / 9),
  }
  const remainingCalories = Math.max(0, Math.round(targets.calories - totals.calories))

  const dayLabel = date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })

  const groupedLogs = MEAL_ORDER
    .map(mealType => ({
      mealType,
      items: logs.filter(l => (l.meal_type || 'snack') === mealType),
    }))
    .filter(g => g.items.length > 0)

  return (
    <div className="space-y-6 bg-light-bg p-6 rounded-card relative" dir="rtl">
      <h2 className="text-2xl font-bold text-dark-text">יומן אכילה</h2>

      {/* Date picker */}
      <div className="flex items-center justify-center gap-4 bg-white border border-light-border rounded-full p-3 shadow-sm max-w-xs mx-auto">
        <button onClick={() => changeDay(-1)} className="text-dark-text-muted hover:text-dark-text text-lg px-2">→</button>
        <span className="text-dark-text font-medium">{dayLabel}</span>
        <button onClick={() => changeDay(1)}  className="text-dark-text-muted hover:text-dark-text text-lg px-2">←</button>
      </div>

      {/* Daily summary rings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-light-border rounded-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-left">
              <div className="text-dark-text-muted text-xs">פחמימות</div>
              <div className="text-dark-text text-sm font-semibold" dir="ltr">{Math.round(totals.carbs)}g / {targets.carbs}g</div>
            </div>
            <MiniRing value={totals.carbs} max={targets.carbs} color="#F97316" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-left">
              <div className="text-dark-text-muted text-xs">שומן</div>
              <div className="text-dark-text text-sm font-semibold" dir="ltr">{Math.round(totals.fat)}g / {targets.fat}g</div>
            </div>
            <MiniRing value={totals.fat} max={targets.fat} color="#EF4444" />
          </div>
        </div>

        <div className="bg-white border border-light-border rounded-card p-4 shadow-sm flex flex-col justify-center gap-2">
          <div className="flex items-center justify-between">
            <span className="text-dark-text-muted text-sm">חלבון</span>
            <span className="text-dark-text font-bold" dir="ltr">{Math.round(totals.protein)}g / <span className="text-lg">{targets.protein}g</span></span>
          </div>
          <ProgressBar value={totals.protein} max={targets.protein} color="bg-green-500" />
        </div>

        <div className="bg-white border border-light-border rounded-card p-4 shadow-sm flex items-center gap-4">
          <div className="relative shrink-0">
            <RemainingRing consumed={totals.calories} target={targets.calories} />
            <div className="absolute inset-0 flex items-center justify-center text-xl">🔥</div>
          </div>
          <div>
            <div className="text-dark-text-muted text-xs">קלוריות שנותרו</div>
            <div className="text-dark-text text-2xl font-bold">{remainingCalories.toLocaleString()}</div>
            <div className="text-dark-text-muted text-xs">מתוך יעד של {targets.calories.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Log list grouped by meal */}
      <div className="space-y-4 pb-16">
        {loading ? (
          <p className="text-dark-text-muted text-sm text-center py-4">טוען...</p>
        ) : groupedLogs.length === 0 ? (
          <div className="bg-white border border-light-border rounded-card p-6 text-center text-dark-text-muted text-sm shadow-sm space-y-3">
            <p>לא נרשמו ארוחות עדיין</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-accent-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent-blue/90 transition shadow-sm"
            >
              + הוסף ארוחה
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-accent-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-accent-blue/90 transition shadow-sm"
              >
                + הוסף ארוחה
              </button>
            </div>
            {groupedLogs.map(({ mealType, items }) => {
            const mealTotal = items.reduce((s, l) => s + (l.calories || 0), 0)
            return (
              <div key={mealType} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-dark-text font-semibold text-sm">{MEAL_LABELS[mealType] || mealType}</h3>
                  <span className="text-dark-text-muted text-sm">{Math.round(mealTotal)} קלוריות</span>
                </div>
                <div className="bg-white border border-light-border rounded-card shadow-sm divide-y divide-light-border overflow-hidden">
                  {items.map(log => (
                    <div key={log.id} className="p-3 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="text-dark-text-muted hover:text-red-600 transition text-lg px-1 shrink-0"
                        aria-label="מחק"
                      >
                        🗑
                      </button>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-dark-text text-sm font-medium truncate">{log.food_name}</p>
                        <p className="text-dark-text-muted text-xs">{log.quantity_g} גרם</p>
                      </div>
                      <span className="text-accent-blue font-semibold text-sm shrink-0">{log.calories} קל'</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          </>
        )}
      </div>

      {/* Floating add button */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-8 left-8 w-14 h-14 rounded-full bg-accent-blue text-white text-2xl shadow-lg hover:bg-accent-blue/90 transition flex items-center justify-center z-40"
        aria-label="הוסף מאכל"
      >
        +
      </button>

      {/* Add food modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-white rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-dark-text font-semibold">הוסף מאכל</h3>
              <button onClick={() => setShowAddModal(false)} className="text-dark-text-muted hover:text-dark-text text-xl px-1">×</button>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FoodSearch onSelect={handleFoodSelect} />

                {selectedFood && (
                  <div className="col-span-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[selectedFood.category] || ''}`}>
                      {selectedFood.category}
                    </span>
                    <span className="text-accent-blue text-sm font-medium">{selectedFood.name}</span>
                    <span className="text-dark-text-muted text-xs mr-auto">לכל 100ג׳: {selectedFood.calories} קק״ל · חלבון {selectedFood.protein}g · פחמ׳ {selectedFood.carbs}g · שומן {selectedFood.fat}g</span>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="text-dark-text-muted text-xs mb-1 block">כמות (גרם)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="100"
                    value={form.quantity_g}
                    onChange={e => handleQuantityChange(e.target.value)}
                    className="w-full bg-white border border-light-border rounded-lg px-3 py-2 text-dark-text text-sm focus:outline-none focus:border-accent-blue"
                  />
                </div>

                {[
                  { key: 'calories', label: 'קלוריות',    placeholder: '0' },
                  { key: 'protein',  label: 'חלבון (g)',  placeholder: '0' },
                  { key: 'carbs',    label: 'פחמימות (g)', placeholder: '0' },
                  { key: 'fat',      label: 'שומן (g)',   placeholder: '0' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-dark-text-muted text-xs mb-1 block">{field.label}</label>
                    <input
                      type="number"
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                      className={`w-full bg-white border rounded-lg px-3 py-2 text-dark-text text-sm focus:outline-none focus:border-accent-blue transition-colors ${
                        selectedFood ? 'border-accent-blue/40' : 'border-light-border'
                      }`}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-dark-text-muted text-xs mb-2 block">ארוחה</label>
                <div className="flex flex-wrap gap-2">
                  {MEAL_TYPES.map(mt => (
                    <button
                      key={mt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, meal_type: mt.value }))}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                        form.meal_type === mt.value
                          ? 'bg-accent-blue text-white'
                          : 'bg-white border border-light-border text-dark-text-muted hover:text-dark-text'
                      }`}
                    >
                      {mt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent-blue text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-accent-blue/90 disabled:opacity-50 transition shadow-sm"
              >
                {submitting ? 'שומר...' : '+ הוסף לאכילה'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
