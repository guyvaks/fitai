import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { nutritionAPI, agentsAPI } from '../services/api'
import { usePolling } from '../hooks/usePolling'
import { useAuth } from '../context/AuthContext'
import ManualPlanModal from '../components/ManualPlanModal'
import FoodLog from './FoodLog'
import { Bot, Loader2, Salad, Droplets, Beef, Flame, Check, ChevronLeft, CheckCircle2, Cog, CalendarDays, ClipboardList, Sun, Soup, Moon, Apple } from 'lucide-react'

const TABS = [
  { key: 'weekly', label: 'תכנון שבועי', Icon: CalendarDays },
  { key: 'daily',  label: 'מעקב יומי',  Icon: ClipboardList },
]

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

// Fixed icon per meal type -- was a generic stock photo unrelated to the
// actual meal (Unsplash lookup by meal_type only, not by content). Colors
// match the existing bg-{color}-soft/text-{color} badge convention used
// elsewhere (e.g. AISuggestion.jsx's MacroPill).
const MEAL_ICONS = {
  breakfast: { Icon: Sun, bg: 'bg-amber-soft', color: 'text-amber' },
  lunch: { Icon: Soup, bg: 'bg-coral-soft', color: 'text-coral' },
  dinner: { Icon: Moon, bg: 'bg-cyan-soft', color: 'text-cyan' },
  snack: { Icon: Apple, bg: 'bg-volt-soft', color: 'text-volt' },
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full bg-white/8 rounded-full h-1.5 mt-1">
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-volt)" strokeWidth="8"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
      />
    </svg>
  )
}

export default function Nutrition() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'daily' ? 'daily' : 'weekly'
  const setActiveTab = (tab) =>
    setSearchParams(tab === 'daily' ? { tab: 'daily' } : {}, { replace: true })
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
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="anim-rise">
        <h2 className="text-3xl font-extrabold text-text-hi tracking-tight">תזונה</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line anim-rise">
        {TABS.map((t) => {
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                isActive
                  ? 'border-volt text-volt'
                  : 'border-transparent text-text-mid hover:text-text-hi'
              }`}
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'daily' ? (
        <FoodLog />
      ) : (
      <>
      {/* Weekly plan actions */}
      <div className="flex justify-end gap-2 flex-wrap anim-rise">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn-volt px-4 py-2 text-sm flex items-center gap-2"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          {generating ? 'יוצר תפריט...' : 'בנה לי תפריט עם AI'}
        </button>
        <button
          onClick={() => setShowManualBuilder(true)}
          className="border border-volt/40 text-volt px-4 py-2 rounded-elem text-sm font-medium hover:bg-volt-soft transition"
        >
          בנה ידנית
        </button>
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
        <div className="card-glass p-6 text-center space-y-4 anim-rise">
          <div className="flex justify-center">
            {done
              ? <CheckCircle2 className="w-10 h-10 text-volt" />
              : <Cog className="w-10 h-10 text-cyan animate-spin [animation-duration:3s]" />}
          </div>
          <p className={`font-medium transition-colors duration-300 ${done ? 'text-volt' : 'text-text-hi'}`}>
            {done ? 'הושלם! עובר לתכנית...' : 'ה-AI בונה את התפריט שלך...'}
          </p>
          {!done && <p className="text-text-mid text-sm">כ-30–60 שניות</p>}

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-white/8 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ease-out ${
                  done ? 'bg-volt' : 'bg-cyan'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs font-medium text-left transition-colors duration-300 tabular-nums ${done ? 'text-volt' : 'text-text-mid'}`} dir="ltr">
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
                    completed ? 'text-volt' : active ? 'text-text-hi' : 'text-text-low/60'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                      completed ? 'bg-volt text-ink' : active ? 'bg-cyan text-ink' : 'bg-white/8 text-text-low'
                    }`}>
                      {completed ? <Check className="w-3 h-3" /> : step.num}
                    </span>
                    <span>{step.label}</span>
                    {active && <span className="text-cyan animate-pulse mr-auto">בתהליך...</span>}
                    {completed && <span className="text-volt mr-auto">הושלם</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-coral-soft border border-coral/30 rounded-card p-4 text-coral text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="anim-rise anim-d1 card-glass p-4 space-y-3">
          <h3 className="text-text-hi font-bold text-sm">סיכום יומי</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-mid inline-flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5 text-cyan" /> שתיית מים</span>
            <span className="text-text-hi font-medium" dir="ltr">1.5L / 2.5L</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-mid inline-flex items-center gap-1.5"><Beef className="w-3.5 h-3.5 text-volt" /> יעד חלבון</span>
            <span className="text-volt font-medium" dir="ltr">{dayTotals ? `${dayTotals.protein}g / ${targets.protein}g` : 'קרוב ליעד'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-mid inline-flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-coral" /> קלוריות בתפריט</span>
            <span className="text-text-hi font-medium">{dayTotals ? <><span dir="ltr">{dayTotals.calories}</span> קק"ל</> : '—'}</span>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="w-full border border-volt/40 text-volt py-2 rounded-elem text-sm font-medium hover:bg-volt-soft transition"
          >
            עריכת יעדים
          </button>
        </div>

        <div className="anim-rise anim-d2 card-glass p-4 flex items-center gap-4">
          <div className="flex-1 space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-0.5">
                <span className="text-text-mid">חלבון</span>
                <span className="text-text-hi font-medium" dir="ltr">{dayTotals?.protein ?? 0}g / {targets.protein}g</span>
              </div>
              <MiniBar value={dayTotals?.protein ?? 0} max={targets.protein} color="var(--color-volt)" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-text-mid">שומן</span>
                  <span className="text-text-hi font-medium" dir="ltr">{dayTotals?.fat ?? 0}g</span>
                </div>
                <MiniBar value={dayTotals?.fat ?? 0} max={targets.fat} color="#FBBF24" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-text-mid">פחמימות</span>
                  <span className="text-text-hi font-medium" dir="ltr">{dayTotals?.carbs ?? 0}g</span>
                </div>
                <MiniBar value={dayTotals?.carbs ?? 0} max={targets.carbs} color="#22D3EE" />
              </div>
            </div>
          </div>
          <div className="relative shrink-0">
            <RemainingRing consumed={dayTotals?.calories ?? 0} target={targets.calories} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-text-hi text-lg font-extrabold tabular-nums" dir="ltr">{remainingCalories.toLocaleString()}</span>
              <span className="text-text-mid text-[10px]">נותרו קלוריות</span>
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
                ? 'bg-volt-soft text-volt border border-volt/40'
                : 'bg-white/4 border border-transparent text-text-mid hover:text-text-hi'
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
            const { Icon: MealIcon, bg: mealBg, color: mealColor } = MEAL_ICONS[meal.meal_type] || MEAL_ICONS.snack
            return (
              <div key={i} className="card-glass card-hover overflow-hidden">
                <button
                  onClick={() => setExpandedMeal(isExpanded ? null : i)}
                  className="w-full flex items-center gap-4 p-3 text-right"
                >
                  <span
                    className={`w-16 h-16 rounded-xl shrink-0 ring-1 ring-line flex items-center justify-center ${mealBg}`}
                    aria-hidden="true"
                  >
                    <MealIcon className={`w-7 h-7 ${mealColor}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-text-hi">{MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
                    {meal.name && <p className="text-text-mid text-sm truncate">{meal.name}</p>}
                    <div className="flex gap-3 text-xs text-text-mid mt-1 flex-wrap">
                      <span>קלוריות <span className="text-text-hi font-medium" dir="ltr">{meal.total_calories}</span></span>
                      <span>חלבון <span className="text-text-hi font-medium" dir="ltr">{meal.total_protein}g</span></span>
                      <span>פחמימות <span className="text-text-hi font-medium" dir="ltr">{meal.total_carbs}g</span></span>
                      <span>שומן <span className="text-text-hi font-medium" dir="ltr">{meal.total_fat}g</span></span>
                    </div>
                  </div>
                  <ChevronLeft className={`w-4 h-4 text-text-mid transition-transform shrink-0 ${isExpanded ? '-rotate-90' : ''}`} />
                </button>
                {isExpanded && meal.items && meal.items.length > 0 && (
                  <div className="border-t border-line px-4 py-3 space-y-1 bg-white/3">
                    {meal.items.map((item, j) => (
                      <div key={j} className="flex justify-between text-xs text-text-mid">
                        <span>{item.name} (<span dir="ltr">{item.qty_g}g</span>)</span>
                        <span><span dir="ltr">{item.calories}</span> קק"ל</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : !generating && (
        <div className="card-glass p-10 text-center space-y-4 anim-rise anim-d3">
          <div className="flex justify-center">
            <span className="w-14 h-14 rounded-full bg-volt-soft text-volt flex items-center justify-center">
              <Salad className="w-7 h-7" />
            </span>
          </div>
          <p className="text-text-hi font-bold">אין תפריט עדיין</p>
          <p className="text-text-mid text-sm">לחץ על "בנה לי תפריט עם AI" ליצירת תפריט מותאם אישית</p>
        </div>
      )}
      </>
      )}
    </div>
  )
}
