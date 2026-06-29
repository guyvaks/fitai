import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { nutritionAPI, agentsAPI } from '../services/api'
import { usePolling } from '../hooks/usePolling'

const DAYS = [
  { key: 'sunday', label: 'ראשון' },
  { key: 'monday', label: 'שני' },
  { key: 'tuesday', label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday', label: 'חמישי' },
  { key: 'friday', label: 'שישי' },
  { key: 'saturday', label: 'שבת' },
]

const MEAL_ICONS = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
}

const MEAL_NAMES = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'ארוחת ביניים',
}

export default function Nutrition() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [activeDay, setActiveDay] = useState('sunday')
  const [generating, setGenerating] = useState(false)
  const [taskId, setTaskId] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const progressRef = useRef(null)

  useEffect(() => {
    nutritionAPI.getPlan()
      .then(r => setPlan(r.data))
      .catch(() => setPlan(null))
  }, [])

  // Tick progress forward slowly — never past 90% until done
  useEffect(() => {
    if (!generating) return
    setProgress(0)
    setDone(false)
    progressRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 90) { clearInterval(progressRef.current); return 90 }
        // slow crawl: faster at start, slower near 90
        const step = p < 30 ? 3 : p < 60 ? 1.5 : 0.5
        return Math.min(p + step, 90)
      })
    }, 600)
    return () => clearInterval(progressRef.current)
  }, [generating])

  const pollStatus = useCallback(async () => {
    if (!taskId) return
    try {
      const r = await agentsAPI.getStatus(taskId)
      if (r.data.status === 'ready') {
        // Jump to 100%, show "הושלם!" for 1.2s, then navigate
        clearInterval(progressRef.current)
        setProgress(100)
        setDone(true)
        setTimeout(() => {
          setGenerating(false)
          setTaskId(null)
          navigate('/ai-suggestion')
        }, 1200)
      } else if (r.data.status === 'error') {
        clearInterval(progressRef.current)
        setGenerating(false)
        setTaskId(null)
        setProgress(0)
        setError('שגיאה ביצירת התכנית: ' + r.data.error)
      }
    } catch {
      // keep polling
    }
  }, [taskId, navigate])

  usePolling(pollStatus, 3000, generating && !!taskId)

  const handleGenerate = async () => {
    setError(null)
    setGenerating(true)
    try {
      const r = await agentsAPI.generateNutrition()
      setTaskId(r.data.task_id)
    } catch (e) {
      clearInterval(progressRef.current)
      setGenerating(false)
      setProgress(0)
      setError(e.response?.data?.detail || 'שגיאה בהפעלת ה-AI')
    }
  }

  const dayMeals = plan?.plan_data?.meal_plan?.[activeDay] || []
  const dayTotals = plan?.plan_data?.daily_totals?.[activeDay] || null

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-text-main">תזונה</h2>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {generating ? '⏳ יוצר תפריט...' : '🤖 בנה לי תפריט עם AI'}
          </button>
          <button
            onClick={() => navigate('/food-log')}
            className="border border-primary text-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/10 transition"
          >
            בנה ידנית
          </button>
        </div>
      </div>

      {/* Generating state */}
      {generating && (
        <div className="bg-surface rounded-card p-6 text-center space-y-4">
          <div className="text-4xl">{done ? '✅' : '⚙️'}</div>
          <p className={`font-medium transition-colors duration-300 ${done ? 'text-green-400' : 'text-text-main'}`}>
            {done ? 'הושלם! עובר לתכנית...' : 'ה-AI בונה את התפריט שלך...'}
          </p>
          {!done && <p className="text-text-muted text-sm">כ-30–60 שניות</p>}

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ease-out ${
                  done ? 'bg-green-500' : 'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs font-medium text-left transition-colors duration-300 ${done ? 'text-green-400' : 'text-text-muted'}`}>
              {Math.round(progress)}%
            </p>
          </div>

          {/* Step progress with numbers */}
          {!done && (
            <div className="text-right space-y-2 mt-1">
              {[
                { num: 1, label: 'ניתוח פרופיל משתמש', from: 0,  to: 50 },
                { num: 2, label: 'בניית תפריט תזונה',  from: 50, to: 100 },
              ].map(step => {
                const active  = progress >= step.from && progress < step.to
                const completed = progress >= step.to
                return (
                  <div key={step.num} className={`flex items-center gap-2 text-xs transition-colors duration-300 ${
                    completed ? 'text-green-400' : active ? 'text-text-main' : 'text-text-muted/40'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                      completed ? 'bg-green-500 text-white' : active ? 'bg-primary text-white' : 'bg-slate-700 text-slate-500'
                    }`}>
                      {completed ? '✓' : step.num}
                    </span>
                    <span>{step.label}</span>
                    {active && <span className="text-primary animate-pulse mr-auto">בתהליך...</span>}
                    {completed && <span className="text-green-400 mr-auto">הושלם</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-card p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDay(d.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              activeDay === d.key
                ? 'bg-primary text-white'
                : 'bg-surface text-text-muted hover:text-text-main'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Daily summary */}
      {dayTotals && (
        <div className="bg-surface rounded-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-text-muted text-sm">סה"כ יומי</span>
            <span className="text-primary font-bold">{dayTotals.calories} קלוריות</span>
          </div>
          <div className="flex gap-4 text-sm text-text-muted">
            <span>חלבון: <span className="text-blue-400 font-medium">{dayTotals.protein}g</span></span>
            <span>פחמימות: <span className="text-yellow-400 font-medium">{dayTotals.carbs}g</span></span>
            <span>שומן: <span className="text-orange-400 font-medium">{dayTotals.fat}g</span></span>
          </div>
        </div>
      )}

      {/* Meal cards */}
      {plan && dayMeals.length > 0 ? (
        <div className="space-y-4">
          {dayMeals.map((meal, i) => (
            <div key={i} className="bg-surface rounded-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{MEAL_ICONS[meal.meal_type] || '🍽️'}</span>
                  <span className="font-medium text-text-main">
                    {MEAL_NAMES[meal.meal_type] || meal.meal_type}
                  </span>
                </div>
                <span className="text-primary font-bold text-sm">{meal.total_calories} קלוריות</span>
              </div>
              {meal.name && <p className="text-text-muted text-sm">{meal.name}</p>}
              <div className="border-t border-slate-700 pt-3 flex gap-4 text-xs text-text-muted">
                <span>חלבון: <span className="text-blue-400">{meal.total_protein}g</span></span>
                <span>פחמימות: <span className="text-yellow-400">{meal.total_carbs}g</span></span>
                <span>שומן: <span className="text-orange-400">{meal.total_fat}g</span></span>
              </div>
              {meal.items && meal.items.length > 0 && (
                <div className="space-y-1">
                  {meal.items.map((item, j) => (
                    <div key={j} className="flex justify-between text-xs text-text-muted">
                      <span>{item.name} ({item.qty_g}g)</span>
                      <span>{item.calories} קק"ל</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !generating && (
        <div className="bg-surface rounded-card p-10 text-center space-y-4">
          <div className="text-5xl">🥗</div>
          <p className="text-text-main font-medium">אין תפריט עדיין</p>
          <p className="text-text-muted text-sm">לחץ על "בנה לי תפריט עם AI" ליצירת תפריט מותאם אישית</p>
        </div>
      )}
    </div>
  )
}
