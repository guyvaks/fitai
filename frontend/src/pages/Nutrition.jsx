import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { nutritionAPI, agentsAPI } from '../services/api'
import { usePolling } from '../hooks/usePolling'
import { useAuth } from '../hooks/useAuth'
import ManualPlanModal from '../components/ManualPlanModal'

const DAYS = [
  { key: 'sunday', label: 'ראשון' },
  { key: 'monday', label: 'שני' },
  { key: 'tuesday', label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday', label: 'חמישי' },
  { key: 'friday', label: 'שישי' },
  { key: 'saturday', label: 'שבת' },
]

const MEAL_NAMES = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'חטיף',
}

const MEAL_IMAGES = {
  breakfast: 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=160&h=160&fit=crop&q=80',
  lunch: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=160&h=160&fit=crop&q=80',
  dinner: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=160&h=160&fit=crop&q=80',
  snack: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=160&h=160&fit=crop&q=80',
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
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

export default function Nutrition() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [plan, setPlan] = useState(null)
  const [activeDay, setActiveDay] = useState('sunday')
  const [generating, setGenerating] = useState(false)
  const [taskId, setTaskId] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [showManualBuilder, setShowManualBuilder] = useState(false)
  const [expandedMeal, setExpandedMeal] = useState(null)
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

  const targetCalories = profile?.target_calories || 2000
  const targets = {
    calories: targetCalories,
    protein:  Math.round((targetCalories * 0.30) / 4),
    carbs:    Math.round((targetCalories * 0.45) / 4),
    fat:      Math.round((targetCalories * 0.25) / 9),
  }
  const remainingCalories = dayTotals ? Math.max(0, Math.round(targets.calories - dayTotals.calories)) : targets.calories

  return (
    <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-dark-text">תזונה</h2>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-accent-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-blue/90 disabled:opacity-50 transition shadow-sm"
          >
            {generating ? '⏳ יוצר תפריט...' : '🤖 בנה לי תפריט עם AI'}
          </button>
          <button
            onClick={() => setShowManualBuilder(true)}
            className="border border-accent-blue text-accent-blue px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition"
          >
            בנה ידנית
          </button>
        </div>
      </div>

      {showManualBuilder && (
        <ManualPlanModal
          onClose={() => setShowManualBuilder(false)}
          onSaved={() => {
            setShowManualBuilder(false)
            nutritionAPI.getPlan().then(r => setPlan(r.data)).catch(() => setPlan(null))
          }}
        />
      )}

      {/* Generating state */}
      {generating && (
        <div className="bg-white border border-light-border rounded-card p-6 text-center space-y-4 shadow-sm">
          <div className="text-4xl">{done ? '✅' : '⚙️'}</div>
          <p className={`font-medium transition-colors duration-300 ${done ? 'text-green-600' : 'text-dark-text'}`}>
            {done ? 'הושלם! עובר לתכנית...' : 'ה-AI בונה את התפריט שלך...'}
          </p>
          {!done && <p className="text-dark-text-muted text-sm">כ-30–60 שניות</p>}

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ease-out ${
                  done ? 'bg-green-500' : 'bg-accent-blue'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs font-medium text-left transition-colors duration-300 ${done ? 'text-green-600' : 'text-dark-text-muted'}`}>
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
                    completed ? 'text-green-600' : active ? 'text-dark-text' : 'text-dark-text-muted/40'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                      completed ? 'bg-green-500 text-white' : active ? 'bg-accent-blue text-white' : 'bg-gray-200 text-gray-400'
                    }`}>
                      {completed ? '✓' : step.num}
                    </span>
                    <span>{step.label}</span>
                    {active && <span className="text-accent-blue animate-pulse mr-auto">בתהליך...</span>}
                    {completed && <span className="text-green-600 mr-auto">הושלם</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-light-border rounded-card p-4 shadow-sm space-y-3">
          <h3 className="text-dark-text font-semibold text-sm">סיכום יומי</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-dark-text-muted">💧 שתיית מים</span>
            <span className="text-dark-text font-medium" dir="ltr">1.5L / 2.5L</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-dark-text-muted">🥩 יעד חלבון</span>
            <span className="text-green-600 font-medium">{dayTotals ? `${dayTotals.protein}g / ${targets.protein}g` : 'קרוב ליעד'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-dark-text-muted">🔥 קלוריות בתפריט</span>
            <span className="text-dark-text font-medium">{dayTotals ? `${dayTotals.calories} קק"ל` : '—'}</span>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="w-full border border-accent-blue text-accent-blue py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition"
          >
            עריכת יעדים
          </button>
        </div>

        <div className="bg-white border border-light-border rounded-card p-4 shadow-sm flex items-center gap-4">
          <div className="flex-1 space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-0.5">
                <span className="text-dark-text-muted">חלבון</span>
                <span className="text-dark-text font-medium" dir="ltr">{dayTotals?.protein ?? 0}g / {targets.protein}g</span>
              </div>
              <MiniBar value={dayTotals?.protein ?? 0} max={targets.protein} color="#22C55E" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-dark-text-muted">שומן</span>
                  <span className="text-dark-text font-medium" dir="ltr">{dayTotals?.fat ?? 0}g</span>
                </div>
                <MiniBar value={dayTotals?.fat ?? 0} max={targets.fat} color="#374151" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-dark-text-muted">פחמימות</span>
                  <span className="text-dark-text font-medium" dir="ltr">{dayTotals?.carbs ?? 0}g</span>
                </div>
                <MiniBar value={dayTotals?.carbs ?? 0} max={targets.carbs} color="#F97316" />
              </div>
            </div>
          </div>
          <div className="relative shrink-0">
            <RemainingRing consumed={dayTotals?.calories ?? 0} target={targets.calories} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-dark-text text-lg font-bold">{remainingCalories.toLocaleString()}</span>
              <span className="text-dark-text-muted text-[10px]">נותרו קלוריות</span>
            </div>
          </div>
        </div>
      </div>

      {/* Day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 justify-center">
        {DAYS.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDay(d.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              activeDay === d.key
                ? 'bg-white text-dark-text shadow-sm border border-light-border'
                : 'bg-gray-100 text-dark-text-muted hover:text-dark-text'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Meal cards */}
      {plan && dayMeals.length > 0 ? (
        <div className="space-y-3">
          {dayMeals.map((meal, i) => {
            const isExpanded = expandedMeal === i
            return (
              <div key={i} className="bg-white border border-light-border rounded-card shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <button
                  onClick={() => setExpandedMeal(isExpanded ? null : i)}
                  className="w-full flex items-center gap-4 p-3 text-right"
                >
                  <img
                    src={MEAL_IMAGES[meal.meal_type] || MEAL_IMAGES.snack}
                    alt={MEAL_NAMES[meal.meal_type] || meal.meal_type}
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-dark-text">{MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
                    {meal.name && <p className="text-dark-text-muted text-sm truncate">{meal.name}</p>}
                    <div className="flex gap-3 text-xs text-dark-text-muted mt-1 flex-wrap">
                      <span>קלוריות <span className="text-dark-text font-medium">{meal.total_calories}</span></span>
                      <span>חלבון <span className="text-dark-text font-medium">{meal.total_protein}g</span></span>
                      <span>פחמימות <span className="text-dark-text font-medium">{meal.total_carbs}g</span></span>
                      <span>שומן <span className="text-dark-text font-medium">{meal.total_fat}g</span></span>
                    </div>
                  </div>
                  <span className={`text-dark-text-muted transition-transform shrink-0 ${isExpanded ? '-rotate-90' : ''}`}>‹</span>
                </button>
                {isExpanded && meal.items && meal.items.length > 0 && (
                  <div className="border-t border-light-border px-4 py-3 space-y-1 bg-gray-50">
                    {meal.items.map((item, j) => (
                      <div key={j} className="flex justify-between text-xs text-dark-text-muted">
                        <span>{item.name} ({item.qty_g}g)</span>
                        <span>{item.calories} קק"ל</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : !generating && (
        <div className="bg-white border border-light-border rounded-card p-10 text-center space-y-4 shadow-sm">
          <div className="text-5xl">🥗</div>
          <p className="text-dark-text font-medium">אין תפריט עדיין</p>
          <p className="text-dark-text-muted text-sm">לחץ על "בנה לי תפריט עם AI" ליצירת תפריט מותאם אישית</p>
        </div>
      )}
    </div>
  )
}
