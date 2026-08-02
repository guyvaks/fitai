import { useState, useEffect } from 'react'
import { nutritionAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import FoodSearch, { CATEGORY_COLOR } from '../components/FoodSearch'
import CalorieCalculatorPanel from '../components/CalorieCalculatorPanel'
import { ChevronRight, ChevronLeft, Flame, Trash2, Plus, X, Loader2, Calculator } from 'lucide-react'

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

function ProgressBar({ value, max, color = 'bg-volt' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-white/8 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-mid w-8 text-left tabular-nums" dir="ltr">{pct}%</span>
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-text-hi tabular-nums" dir="ltr">
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-volt)" strokeWidth="8"
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
  const [showCalcModal, setShowCalcModal] = useState(false)
  const [calcMealType, setCalcMealType] = useState('breakfast')

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
    const quantity_g = parseFloat(form.quantity_g) || 100
    if (quantity_g <= 0) {
      setError('כמות חייבת להיות גדולה מ-0')
      return
    }
    // Explicit validation (rather than relying on the <input>'s native HTML5
    // constraint validation) so decimal macro values -- the normal case,
    // e.g. 24.8g protein from an auto-filled selected food -- are always
    // accepted, and any genuine invalid entry blocks the save with a visible
    // in-app error instead of a native browser tooltip the user may not see.
    const macroFields = [
      { key: 'calories', label: 'קלוריות' },
      { key: 'protein',  label: 'חלבון' },
      { key: 'carbs',    label: 'פחמימות' },
      { key: 'fat',      label: 'שומן' },
    ]
    const macros = {}
    for (const { key, label } of macroFields) {
      const raw = form[key]
      const num = parseFloat(raw)
      if (raw !== '' && (!Number.isFinite(num) || num < 0)) {
        setError(`ערך לא תקין בשדה "${label}"`)
        return
      }
      macros[key] = Number.isFinite(num) ? num : 0
    }
    setSubmitting(true)
    try {
      await nutritionAPI.logFood({
        date:       dateStr,
        meal_type:  form.meal_type,
        food_name:  form.food_name,
        quantity_g,
        calories:   macros.calories,
        protein:    macros.protein,
        carbs:      macros.carbs,
        fat:        macros.fat,
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

  const handleAddFromCalculator = async (item) => {
    try {
      await nutritionAPI.logFood({
        date: dateStr,
        meal_type: calcMealType,
        food_name: item.name,
        quantity_g: item.qty_g,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      })
      fetchLogs()
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בהוספה ליומן')
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
    <div className="space-y-6 relative" dir="rtl">
      {/* Date picker */}
      <div className="anim-rise anim-d1 flex items-center justify-center gap-4 card-glass !rounded-full p-3 max-w-xs mx-auto">
        <button onClick={() => changeDay(-1)} className="text-text-mid hover:text-volt transition-colors px-2" aria-label="יום קודם"><ChevronRight className="w-5 h-5" /></button>
        <span className="text-text-hi font-medium">{dayLabel}</span>
        <button onClick={() => changeDay(1)}  className="text-text-mid hover:text-volt transition-colors px-2" aria-label="יום הבא"><ChevronLeft className="w-5 h-5" /></button>
      </div>

      {/* Daily summary rings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="anim-rise anim-d1 card-glass p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-left">
              <div className="text-text-mid text-xs">פחמימות</div>
              <div className="text-text-hi text-sm font-semibold" dir="ltr">{Math.round(totals.carbs)}g / {targets.carbs}g</div>
            </div>
            <MiniRing value={totals.carbs} max={targets.carbs} color="#22D3EE" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-left">
              <div className="text-text-mid text-xs">שומן</div>
              <div className="text-text-hi text-sm font-semibold" dir="ltr">{Math.round(totals.fat)}g / {targets.fat}g</div>
            </div>
            <MiniRing value={totals.fat} max={targets.fat} color="#FBBF24" />
          </div>
        </div>

        <div className="anim-rise anim-d2 card-glass p-4 flex flex-col justify-center gap-2">
          <div className="flex items-center justify-between">
            <span className="text-text-mid text-sm">חלבון</span>
            <span className="text-text-hi font-bold" dir="ltr">{Math.round(totals.protein)}g / <span className="text-lg">{targets.protein}g</span></span>
          </div>
          <ProgressBar value={totals.protein} max={targets.protein} color="bg-volt" />
        </div>

        <div className="anim-rise anim-d3 card-glass p-4 flex items-center gap-4">
          <div className="relative shrink-0">
            <RemainingRing consumed={totals.calories} target={targets.calories} />
            <div className="absolute inset-0 flex items-center justify-center text-coral"><Flame className="w-5 h-5" /></div>
          </div>
          <div>
            <div className="text-text-mid text-xs">קלוריות שנותרו</div>
            <div className="text-text-hi text-2xl font-extrabold tabular-nums" dir="ltr">{remainingCalories.toLocaleString()}</div>
            <div className="text-text-mid text-xs">מתוך יעד של <span dir="ltr">{targets.calories.toLocaleString()}</span></div>
          </div>
        </div>
      </div>

      {/* Log list grouped by meal */}
      <div className="space-y-4 pb-16">
        {loading ? (
          <p className="text-text-mid text-sm text-center py-4 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-volt" /> טוען...</p>
        ) : groupedLogs.length === 0 ? (
          <div className="card-glass p-6 text-center text-text-mid text-sm space-y-3 anim-rise anim-d3">
            <p>לא נרשמו ארוחות עדיין</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-volt px-4 py-2 text-sm inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> הוסף ארוחה
              </button>
              <button
                onClick={() => setShowCalcModal(true)}
                className="border border-volt/40 text-volt px-4 py-2 rounded-elem text-sm font-medium hover:bg-volt-soft transition inline-flex items-center gap-1.5"
              >
                <Calculator className="w-4 h-4" /> חשב עם AI
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-end gap-2 flex-wrap">
              <button
                onClick={() => setShowCalcModal(true)}
                className="border border-volt/40 text-volt px-4 py-2 rounded-elem text-sm font-medium hover:bg-volt-soft transition inline-flex items-center gap-1.5"
              >
                <Calculator className="w-4 h-4" /> חשב עם AI
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-volt px-4 py-2 text-sm inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> הוסף ארוחה
              </button>
            </div>
            {groupedLogs.map(({ mealType, items }) => {
            const mealTotal = items.reduce((s, l) => s + (l.calories || 0), 0)
            return (
              <div key={mealType} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-text-hi font-bold text-sm">{MEAL_LABELS[mealType] || mealType}</h3>
                  <span className="text-text-mid text-sm"><span dir="ltr">{Math.round(mealTotal)}</span> קלוריות</span>
                </div>
                <div className="card-glass divide-y divide-line overflow-hidden">
                  {items.map(log => (
                    <div key={log.id} className="p-3 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleDelete(log.id)}
                        className="text-text-mid hover:text-coral hover:bg-coral-soft rounded-lg transition p-1.5 shrink-0"
                        aria-label="מחק"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-text-hi text-sm font-medium truncate">{log.food_name}</p>
                        <p className="text-text-mid text-xs"><span dir="ltr">{log.quantity_g}</span> גרם</p>
                      </div>
                      <span className="text-volt font-semibold text-sm shrink-0 tabular-nums"><span dir="ltr">{log.calories}</span> קל'</span>
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
        className="fixed bottom-8 left-8 w-14 h-14 rounded-full bg-volt text-ink shadow-[0_6px_24px_rgba(163,230,53,0.35)] hover:brightness-105 active:scale-95 transition flex items-center justify-center z-40"
        aria-label="הוסף מאכל"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

      {/* Add food modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div
            className="bg-surface-2 border border-line-strong rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-text-hi font-bold">הוסף מאכל</h3>
              <button onClick={() => setShowAddModal(false)} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור"><X className="w-5 h-5" /></button>
            </div>
            {error && <p className="text-coral text-sm">{error}</p>}

            {/* noValidate: validation is handled explicitly in handleSubmit so
                decimal macro values (e.g. 24.8g protein) are never silently
                blocked by the browser's native step-mismatch check, which
                defaults to whole numbers only and gives no visible in-app
                feedback when it fires. */}
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <FoodSearch onSelect={handleFoodSelect} />

                {selectedFood && (
                  <div className="col-span-2 flex items-center gap-2 bg-volt-soft border border-volt/25 rounded-elem px-3 py-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[selectedFood.category] || ''}`}>
                      {selectedFood.category}
                    </span>
                    <span className="text-volt text-sm font-medium">{selectedFood.name}</span>
                    <span className="text-text-mid text-xs mr-auto">לכל 100ג׳: <span dir="ltr">{selectedFood.calories}</span> קק״ל · חלבון <span dir="ltr">{selectedFood.protein}g</span> · פחמ׳ <span dir="ltr">{selectedFood.carbs}g</span> · שומן <span dir="ltr">{selectedFood.fat}g</span></span>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="text-text-mid text-xs mb-1 block">כמות (גרם)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="100"
                    value={form.quantity_g}
                    onChange={e => handleQuantityChange(e.target.value)}
                    className="input-volt"
                  />
                </div>

                {[
                  { key: 'calories', label: 'קלוריות',    placeholder: '0' },
                  { key: 'protein',  label: 'חלבון (g)',  placeholder: '0' },
                  { key: 'carbs',    label: 'פחמימות (g)', placeholder: '0' },
                  { key: 'fat',      label: 'שומן (g)',   placeholder: '0' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-text-mid text-xs mb-1 block">{field.label}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      placeholder={field.placeholder}
                      value={form[field.key]}
                      onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                      className={`input-volt ${selectedFood ? '!border-volt/40' : ''}`}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-text-mid text-xs mb-2 block">ארוחה</label>
                <div className="flex flex-wrap gap-2">
                  {MEAL_TYPES.map(mt => (
                    <button
                      key={mt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, meal_type: mt.value }))}
                      className={`px-3 py-1.5 rounded-elem text-xs font-medium transition ${
                        form.meal_type === mt.value
                          ? 'bg-volt text-ink'
                          : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
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
                className="btn-volt w-full py-2.5 text-sm flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {submitting ? 'שומר...' : 'הוסף לאכילה'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* AI calorie calculator modal */}
      {showCalcModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCalcModal(false)}>
          <div
            className="bg-surface-2 border border-line-strong rounded-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-text-hi font-bold inline-flex items-center gap-1.5"><Calculator className="w-4 h-4 text-volt" /> חשב עם AI</h3>
              <button onClick={() => setShowCalcModal(false)} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור"><X className="w-5 h-5" /></button>
            </div>

            <div>
              <label className="text-text-mid text-xs mb-2 block">ארוחה</label>
              <div className="flex flex-wrap gap-2">
                {MEAL_TYPES.map(mt => (
                  <button
                    key={mt.value}
                    type="button"
                    onClick={() => setCalcMealType(mt.value)}
                    className={`px-3 py-1.5 rounded-elem text-xs font-medium transition ${
                      calcMealType === mt.value
                        ? 'bg-volt text-ink'
                        : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
                    }`}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>

            <CalorieCalculatorPanel onAddItem={handleAddFromCalculator} />
          </div>
        </div>
      )}
    </div>
  )
}
