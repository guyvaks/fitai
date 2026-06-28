import { useState, useEffect } from 'react'
import { nutritionAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'

const MEAL_TYPES = [
  { value: 'breakfast', label: 'בוקר' },
  { value: 'snack1', label: 'ביניים' },
  { value: 'lunch', label: 'צהריים' },
  { value: 'snack2', label: 'ביניים' },
  { value: 'dinner', label: 'ערב' },
]

const MEAL_LABELS = {
  breakfast: 'ארוחת בוקר',
  snack1: 'ביניים (בוקר)',
  lunch: 'ארוחת צהריים',
  snack2: 'ביניים (ערב)',
  dinner: 'ארוחת ערב',
  snack: 'ביניים',
}

function toIso(date) {
  return date.toISOString().split('T')[0]
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

export default function FoodLog() {
  const { profile } = useAuth()
  const [date, setDate] = useState(new Date())
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    food_name: '',
    quantity_g: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    meal_type: 'breakfast',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const dateStr = toIso(date)

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
        date: dateStr,
        meal_type: form.meal_type,
        food_name: form.food_name,
        quantity_g: parseFloat(form.quantity_g) || 100,
        calories: parseFloat(form.calories) || 0,
        protein: parseFloat(form.protein) || 0,
        carbs: parseFloat(form.carbs) || 0,
        fat: parseFloat(form.fat) || 0,
      })
      setForm({ food_name: '', quantity_g: '', calories: '', protein: '', carbs: '', fat: '', meal_type: form.meal_type })
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
    protein: acc.protein + (l.protein || 0),
    carbs: acc.carbs + (l.carbs || 0),
    fat: acc.fat + (l.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const targets = {
    calories: profile?.target_calories || 2000,
    protein: Math.round((profile?.target_calories || 2000) * 0.3 / 4),
    carbs: Math.round((profile?.target_calories || 2000) * 0.45 / 4),
    fat: Math.round((profile?.target_calories || 2000) * 0.25 / 9),
  }

  const dayLabel = date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-2xl font-bold text-text-main">יומן אכילה</h2>

      {/* Date picker */}
      <div className="flex items-center justify-center gap-4 bg-surface rounded-card p-3">
        <button onClick={() => changeDay(1)} className="text-text-muted hover:text-text-main text-lg px-2">→</button>
        <span className="text-text-main font-medium">{dayLabel}</span>
        <button onClick={() => changeDay(-1)} className="text-text-muted hover:text-text-main text-lg px-2">←</button>
      </div>

      {/* Daily summary */}
      <div className="bg-surface rounded-card p-4 space-y-3">
        <h3 className="text-text-main font-semibold text-sm">סיכום יומי</h3>
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-muted">קלוריות</span>
              <span className="text-primary font-medium">{Math.round(totals.calories)} / {targets.calories}</span>
            </div>
            <ProgressBar value={totals.calories} max={targets.calories} color="bg-primary" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-muted">חלבון</span>
              <span className="text-blue-400 font-medium">{Math.round(totals.protein)}g / {targets.protein}g</span>
            </div>
            <ProgressBar value={totals.protein} max={targets.protein} color="bg-blue-500" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-muted">פחמימות</span>
              <span className="text-yellow-400 font-medium">{Math.round(totals.carbs)}g / {targets.carbs}g</span>
            </div>
            <ProgressBar value={totals.carbs} max={targets.carbs} color="bg-yellow-500" />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-muted">שומן</span>
              <span className="text-orange-400 font-medium">{Math.round(totals.fat)}g / {targets.fat}g</span>
            </div>
            <ProgressBar value={totals.fat} max={targets.fat} color="bg-orange-500" />
          </div>
        </div>
      </div>

      {/* Add food form */}
      <div className="bg-surface rounded-card p-4 space-y-4">
        <h3 className="text-text-main font-semibold">הוסף מאכל</h3>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-text-muted text-xs mb-1 block">שם המאכל</label>
              <input
                type="text"
                placeholder="חיפוש מאכל..."
                value={form.food_name}
                onChange={e => setForm(f => ({ ...f, food_name: e.target.value }))}
                className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-text-muted text-xs mb-1 block">כמות (גרם)</label>
              <input
                type="number"
                placeholder="100"
                value={form.quantity_g}
                onChange={e => setForm(f => ({ ...f, quantity_g: e.target.value }))}
                className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-text-muted text-xs mb-1 block">קלוריות</label>
              <input
                type="number"
                placeholder="0"
                value={form.calories}
                onChange={e => setForm(f => ({ ...f, calories: e.target.value }))}
                className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-text-muted text-xs mb-1 block">חלבון (g)</label>
              <input
                type="number"
                placeholder="0"
                value={form.protein}
                onChange={e => setForm(f => ({ ...f, protein: e.target.value }))}
                className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-text-muted text-xs mb-1 block">פחמימות (g)</label>
              <input
                type="number"
                placeholder="0"
                value={form.carbs}
                onChange={e => setForm(f => ({ ...f, carbs: e.target.value }))}
                className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-text-muted text-xs mb-1 block">שומן (g)</label>
              <input
                type="number"
                placeholder="0"
                value={form.fat}
                onChange={e => setForm(f => ({ ...f, fat: e.target.value }))}
                className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
              />
            </div>
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
            className="w-full bg-primary text-white py-2 rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {submitting ? 'שומר...' : '+ הוסף'}
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
            <div key={log.id} className="bg-surface rounded-card p-3 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text-main text-sm font-medium">{log.food_name}</span>
                  <span className="text-xs text-text-muted bg-background px-2 py-0.5 rounded-full">
                    {MEAL_LABELS[log.meal_type] || log.meal_type}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-text-muted mt-1">
                  <span>{log.quantity_g}g</span>
                  <span className="text-primary">{log.calories} קק"ל</span>
                  <span>חלבון: {log.protein}g</span>
                  <span>פחמ': {log.carbs}g</span>
                  <span>שומן: {log.fat}g</span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(log.id)}
                className="text-text-muted hover:text-red-400 transition text-lg px-2"
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
