import { useState, useEffect, useRef } from 'react'
import { nutritionAPI, foodsAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'

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

const CATEGORY_COLOR = {
  'חלבונים':      'bg-blue-500/15 text-blue-400',
  'מוצרי חלב':   'bg-purple-500/15 text-purple-400',
  'פחמימות':      'bg-yellow-500/15 text-yellow-400',
  'ירקות':        'bg-green-500/15 text-green-400',
  'פירות':        'bg-orange-500/15 text-orange-400',
  'שומנים':       'bg-red-500/15 text-red-400',
  'חטיפים בריאים':'bg-teal-500/15 text-teal-400',
}

function toIso(date) {
  return date.toISOString().split('T')[0]
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function ProgressBar({ value, max, color = 'bg-primary' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-muted w-8 text-left">{pct}%</span>
    </div>
  )
}

const CATEGORIES = [
  'כל הקטגוריות',
  'חלבונים',
  'פחמימות',
  'ירקות',
  'פירות',
  'מוצרי חלב',
  'שומנים',
  'חטיפים בריאים',
]

// ─── Food Search + Grid ───────────────────────────────────────────────────────
function FoodSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('כל הקטגוריות')
  const [allFoods, setAllFoods] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  // Load all foods on mount
  useEffect(() => {
    foodsAPI.search('').then(r => setAllFoods(r.data)).catch(() => {})
  }, [])

  // Re-fetch when category changes (server-side filter)
  const doSearch = (q, cat) => {
    clearTimeout(debounceRef.current)
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await foodsAPI.search(q, cat === 'כל הקטגוריות' ? '' : cat)
        setAllFoods(r.data)
      } catch {
        setAllFoods([])
      } finally {
        setSearching(false)
      }
    }, 200)
  }

  const handleQueryChange = (e) => {
    const val = e.target.value
    setQuery(val)
    doSearch(val, category)
  }

  const handleCategoryChange = (e) => {
    const cat = e.target.value
    setCategory(cat)
    doSearch(query, cat)
  }

  // Group results by category for grid display
  const grouped = allFoods.reduce((acc, food) => {
    if (!acc[food.category]) acc[food.category] = []
    acc[food.category].push(food)
    return acc
  }, {})

  const groupOrder = CATEGORIES.filter(c => c !== 'כל הקטגוריות' && grouped[c])

  return (
    <div className="col-span-2 space-y-3">
      <label className="text-text-muted text-xs block">חיפוש מאכל</label>

      {/* Category tabs + search */}
      <div className="space-y-2">
        {/* Category filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange({ target: { value: cat } })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                category === cat
                  ? 'bg-primary text-white'
                  : cat === 'כל הקטגוריות'
                    ? 'bg-background border border-slate-600 text-text-muted hover:text-text-main'
                    : `${CATEGORY_COLOR[cat] || 'bg-slate-700 text-text-muted'} opacity-70 hover:opacity-100`
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="חיפוש חופשי..."
            value={query}
            onChange={handleQueryChange}
            className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
            autoComplete="off"
          />
          {searching && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">⏳</span>
          )}
        </div>
      </div>

      {/* Foods grid — grouped by category */}
      <div className="space-y-4 max-h-72 overflow-y-auto pl-1">
        {groupOrder.length === 0 && !searching && (
          <p className="text-text-muted text-sm text-center py-3">לא נמצאו מוצרים</p>
        )}
        {groupOrder.map(cat => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[cat] || 'bg-slate-700 text-text-muted'}`}>
                {cat}
              </span>
              <span className="text-text-muted text-xs">{grouped[cat].length} מוצרים</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped[cat].map(food => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => onSelect(food)}
                  className="bg-background hover:bg-primary/10 hover:border-primary/40 border border-slate-700/50 rounded-lg px-3 py-2 text-right transition-all group"
                >
                  <p className="text-text-main text-xs font-medium leading-tight group-hover:text-primary transition-colors truncate">{food.name}</p>
                  <p className="text-text-muted text-xs mt-0.5">{food.calories} קק״ל · ח׳ {food.protein}g</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FoodLog() {
  const { profile } = useAuth()
  const [date, setDate] = useState(new Date())
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)

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

  const dayLabel = date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-2xl font-bold text-text-main">יומן אכילה</h2>

      {/* Date picker */}
      <div className="flex items-center justify-center gap-4 bg-surface rounded-card p-3">
        <button onClick={() => changeDay(-1)} className="text-text-muted hover:text-text-main text-lg px-2">→</button>
        <span className="text-text-main font-medium">{dayLabel}</span>
        <button onClick={() => changeDay(1)}  className="text-text-muted hover:text-text-main text-lg px-2">←</button>
      </div>

      {/* Daily summary */}
      <div className="bg-surface rounded-card p-4 space-y-3">
        <h3 className="text-text-main font-semibold text-sm">סיכום יומי</h3>
        <div className="space-y-2">
          {[
            { label: 'קלוריות', value: totals.calories, target: targets.calories, unit: 'קק"ל', color: 'bg-primary', textColor: 'text-primary' },
            { label: 'חלבון',   value: totals.protein,  target: targets.protein,  unit: 'g',    color: 'bg-blue-500',   textColor: 'text-blue-400' },
            { label: 'פחמימות', value: totals.carbs,    target: targets.carbs,    unit: 'g',    color: 'bg-yellow-500', textColor: 'text-yellow-400' },
            { label: 'שומן',    value: totals.fat,      target: targets.fat,      unit: 'g',    color: 'bg-orange-500', textColor: 'text-orange-400' },
          ].map(row => (
            <div key={row.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-muted">{row.label}</span>
                <span className={`${row.textColor} font-medium`}>{Math.round(row.value)}{row.unit} / {row.target}{row.unit}</span>
              </div>
              <ProgressBar value={row.value} max={row.target} color={row.color} />
            </div>
          ))}
        </div>
      </div>

      {/* Add food form */}
      <div className="bg-surface rounded-card p-4 space-y-4">
        <h3 className="text-text-main font-semibold">הוסף מאכל</h3>
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">

            {/* Food search — spans full width */}
            <FoodSearch onSelect={handleFoodSelect} />

            {/* Selected food info chip */}
            {selectedFood && (
              <div className="col-span-2 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[selectedFood.category] || ''}`}>
                  {selectedFood.category}
                </span>
                <span className="text-primary text-sm font-medium">{selectedFood.name}</span>
                <span className="text-text-muted text-xs mr-auto">לכל 100ג׳: {selectedFood.calories} קק״ל · חלבון {selectedFood.protein}g · פחמ׳ {selectedFood.carbs}g · שומן {selectedFood.fat}g</span>
              </div>
            )}

            {/* Quantity */}
            <div className="col-span-2">
              <label className="text-text-muted text-xs mb-1 block">כמות (גרם)</label>
              <input
                type="number"
                min="1"
                placeholder="100"
                value={form.quantity_g}
                onChange={e => handleQuantityChange(e.target.value)}
                className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
              />
            </div>

            {/* Macro fields — auto-filled, still editable */}
            {[
              { key: 'calories', label: 'קלוריות',    placeholder: '0' },
              { key: 'protein',  label: 'חלבון (g)',  placeholder: '0' },
              { key: 'carbs',    label: 'פחמימות (g)', placeholder: '0' },
              { key: 'fat',      label: 'שומן (g)',   placeholder: '0' },
            ].map(field => (
              <div key={field.key}>
                <label className="text-text-muted text-xs mb-1 block">{field.label}</label>
                <input
                  type="number"
                  placeholder={field.placeholder}
                  value={form[field.key]}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary transition-colors ${
                    selectedFood ? 'border-primary/40' : 'border-slate-700'
                  }`}
                />
              </div>
            ))}
          </div>

          {/* Meal type */}
          <div>
            <label className="text-text-muted text-xs mb-2 block">ארוחה</label>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map(mt => (
                <button
                  key={mt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, meal_type: mt.value }))}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    form.meal_type === mt.value
                      ? 'bg-primary text-white'
                      : 'bg-background border border-slate-700 text-text-muted hover:text-text-main'
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
            className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {submitting ? 'שומר...' : '+ הוסף לאכילה'}
          </button>
        </form>
      </div>

      {/* Log list */}
      <div className="space-y-2">
        <h3 className="text-text-main font-semibold text-sm">מה אכלת היום</h3>
        {loading ? (
          <p className="text-text-muted text-sm text-center py-4">טוען...</p>
        ) : logs.length === 0 ? (
          <div className="bg-surface rounded-card p-6 text-center text-text-muted text-sm">
            לא נרשמו ארוחות עדיין
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="bg-surface rounded-card p-3 flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-text-main text-sm font-medium truncate">{log.food_name}</span>
                  <span className="text-xs text-text-muted bg-background px-2 py-0.5 rounded-full shrink-0">
                    {MEAL_LABELS[log.meal_type] || log.meal_type}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-text-muted mt-1 flex-wrap">
                  <span>{log.quantity_g}g</span>
                  <span className="text-primary font-medium">{log.calories} קק"ל</span>
                  <span>ח׳ {log.protein}g</span>
                  <span>פ׳ {log.carbs}g</span>
                  <span>ש׳ {log.fat}g</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(log.id)}
                className="text-text-muted hover:text-red-400 transition text-xl px-1 shrink-0"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
