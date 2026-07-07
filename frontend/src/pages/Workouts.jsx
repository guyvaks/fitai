import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { workoutsAPI, agentsAPI } from '../services/api'
import { usePolling } from '../hooks/usePolling'
import { Bot, Loader2, Dumbbell, Pencil, Play, Check, CheckCircle2, Moon, Inbox, ChevronLeft } from 'lucide-react'

const DAYS = [
  { key: 'sunday',    label: 'ראשון' },
  { key: 'monday',    label: 'שני' },
  { key: 'tuesday',   label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday',  label: 'חמישי' },
  { key: 'friday',    label: 'שישי' },
  { key: 'saturday',  label: 'שבת' },
]
const DAY_KEYS = DAYS.map(d => d.key)
const ACTIVE_DAY_STORAGE_KEY = 'fitai_workouts_active_day'

// Current week's Sun–Sat dates, purely for the date strip display
function getWeekDates() {
  const today = new Date()
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay())
  return DAY_KEYS.map((key, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return { key, dayOfMonth: d.getDate(), isToday: d.toDateString() === today.toDateString() }
  })
}

export default function Workouts() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeDay, setActiveDayState] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_DAY_STORAGE_KEY)
    return DAY_KEYS.includes(saved) ? saved : 'sunday'
  })
  const setActiveDay = (day) => {
    setActiveDayState(day)
    localStorage.setItem(ACTIVE_DAY_STORAGE_KEY, day)
  }
  const [generating, setGenerating] = useState(false)
  const [taskId, setTaskId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [genError, setGenError] = useState(null)
  const [lastWeights, setLastWeights] = useState({})
  const progressRef = useRef(null)
  const weekDates = useRef(getWeekDates()).current

  useEffect(() => {
    workoutsAPI.getPlan()
      .then(({ data }) => setPlan(data))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false))
  }, [])

  // Progress ticker
  useEffect(() => {
    if (!generating) return
    setProgress(0)
    setDone(false)
    progressRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 90) { clearInterval(progressRef.current); return 90 }
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
        setGenError('שגיאה ביצירת תכנית האימונים: ' + r.data.error)
      }
    } catch { /* keep polling */ }
  }, [taskId, navigate])

  usePolling(pollStatus, 3000, generating && !!taskId)

  const handleGenerateAI = async () => {
    setGenError(null)
    setGenerating(true)
    try {
      const r = await agentsAPI.generateWorkout()
      setTaskId(r.data.task_id)
    } catch (e) {
      clearInterval(progressRef.current)
      setGenerating(false)
      setProgress(0)
      setGenError(e.response?.data?.detail || 'שגיאה בהפעלת ה-AI')
    }
  }

  const getDayExercises = (day) => {
    if (!plan) return []
    if (plan.plan_data && plan.plan_data[day]) {
      const dayData = plan.plan_data[day]
      if (Array.isArray(dayData)) return dayData
      if (dayData.exercises) return dayData.exercises
    }
    return []
  }

  const getDayName = (day) => {
    if (!plan) return null
    if (plan.plan_data && plan.plan_data[day] && plan.plan_data[day].name) {
      return plan.plan_data[day].name
    }
    return null
  }

  // 'rest': explicitly marked as a rest day in the plan
  // 'no_plan': no exercises and not marked as rest — nothing was planned for this day
  // 'has_plan': has exercises
  const getDayStatus = (day) => {
    if (plan?.plan_data?.[day]?.rest) return 'rest'
    const exercises = getDayExercises(day)
    if (exercises.length === 0) return 'no_plan'
    return 'has_plan'
  }

  // Fetch last-used weight per exercise for the active day (exercise memory, already tracked server-side)
  useEffect(() => {
    const exercises = getDayExercises(activeDay)
    if (exercises.length === 0) return
    let cancelled = false
    Promise.all(
      exercises.map(ex =>
        workoutsAPI.getExerciseMemory(ex.name)
          .then(({ data }) => [ex.name, data?.last_weight_kg ?? null])
          .catch(() => [ex.name, null])
      )
    ).then(entries => {
      if (!cancelled) setLastWeights(Object.fromEntries(entries))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay, plan])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-64 card-glass">
        <Loader2 className="w-5 h-5 animate-spin text-volt" />
        <div className="text-text-mid text-lg">טוען תכנית אימונים...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between anim-rise">
        <h1 className="text-3xl font-extrabold text-text-hi tracking-tight">תכנית האימונים שלך</h1>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="btn-volt px-4 py-2 text-sm flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            {generating ? 'יוצר תכנית...' : 'בנה לי עם AI'}
          </button>
          <button className="bg-white/4 border border-line text-text-hi px-4 py-2 rounded-elem font-medium text-sm hover:bg-white/8 transition-colors flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> בנה ידנית
          </button>
        </div>
      </div>

      {/* Generating state */}
      {generating && (
        <div className="card-glass p-6 text-center space-y-4 anim-rise">
          <div className="flex justify-center">
            {done
              ? <CheckCircle2 className="w-10 h-10 text-volt" />
              : <Dumbbell className="w-10 h-10 text-cyan animate-pulse" />}
          </div>
          <p className={`font-medium transition-colors duration-300 ${done ? 'text-volt' : 'text-text-hi'}`}>
            {done ? 'הושלם! עובר לתכנית...' : 'ה-AI בונה את תכנית האימונים שלך...'}
          </p>
          {!done && <p className="text-text-mid text-sm">כ-20–40 שניות</p>}
          <div className="space-y-1.5">
            <div className="w-full bg-white/8 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ease-out ${done ? 'bg-volt' : 'bg-cyan'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs font-medium text-left transition-colors tabular-nums ${done ? 'text-volt' : 'text-text-mid'}`} dir="ltr">
              {Math.round(progress)}%
            </p>
          </div>
          {!done && (
            <div className="text-right space-y-2 mt-1">
              {[
                { num: 1, label: 'ניתוח פרופיל משתמש', from: 0,  to: 50 },
                { num: 2, label: 'בניית תכנית אימונים', from: 50, to: 100 },
              ].map(step => {
                const active    = progress >= step.from && progress < step.to
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
                    {active    && <span className="text-cyan animate-pulse mr-auto">בתהליך...</span>}
                    {completed && <span className="text-volt mr-auto">הושלם</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {genError && (
        <div className="bg-coral-soft border border-coral/30 rounded-card p-4 text-coral text-sm">
          {genError}
        </div>
      )}

      {/* Day + date selector (single, synced selector — day name and date always move together) */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {weekDates.map(d => {
          const status = getDayStatus(d.key)
          return (
            <button
              key={d.key}
              onClick={() => setActiveDay(d.key)}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[60px] h-16 px-2 rounded-xl shrink-0 transition-all ${
                activeDay === d.key
                  ? 'bg-volt text-ink shadow-[0_4px_18px_rgba(163,230,53,0.3)]'
                  : d.isToday
                    ? 'bg-white/4 border border-volt/40 text-text-hi hover:bg-white/8'
                    : 'bg-white/4 border border-line text-text-hi hover:bg-white/8'
              }`}
            >
              <span className="text-xs font-medium opacity-90">{DAYS.find(x => x.key === d.key)?.label}</span>
              <span className="text-base font-bold tabular-nums">{d.dayOfMonth}</span>
              {status === 'has_plan' && (
                <span className={`w-1 h-1 rounded-full ${activeDay === d.key ? 'bg-ink' : 'bg-volt'}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Day content */}
      {!plan ? (
        <div className="card-glass p-10 text-center space-y-4 anim-rise anim-d2">
          <div className="flex justify-center">
            <span className="w-14 h-14 rounded-full bg-volt-soft text-volt flex items-center justify-center">
              <Dumbbell className="w-7 h-7" />
            </span>
          </div>
          <p className="text-text-mid text-lg">לא הגדרת תכנית אימונים עדיין</p>
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="btn-volt px-6 py-3 text-sm inline-flex items-center gap-2"
          >
            <Bot className="w-4 h-4" /> בנה עם AI
          </button>
        </div>
      ) : getDayStatus(activeDay) === 'rest' ? (
        <div className="card-glass p-10 text-center space-y-2 anim-rise anim-d2">
          <div className="flex justify-center">
            <span className="w-14 h-14 rounded-full bg-cyan-soft text-cyan flex items-center justify-center">
              <Moon className="w-7 h-7" />
            </span>
          </div>
          <p className="text-text-hi text-xl font-bold mt-3">יום מנוחה</p>
          <p className="text-text-mid">המנוחה היא חלק חשוב מהאימון</p>
        </div>
      ) : getDayStatus(activeDay) === 'no_plan' ? (
        <div className="card-glass p-10 text-center space-y-4 anim-rise anim-d2">
          <div className="flex justify-center">
            <span className="w-14 h-14 rounded-full bg-white/6 text-text-mid flex items-center justify-center">
              <Inbox className="w-7 h-7" />
            </span>
          </div>
          <p className="text-text-mid text-lg">אין תרגילים מתוכננים ליום זה</p>
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="btn-volt px-6 py-3 text-sm inline-flex items-center gap-2"
          >
            <Bot className="w-4 h-4" /> בנה תכנית ליום זה עם AI
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {getDayName(activeDay) && (
              <h2 className="text-lg font-bold text-text-hi">{getDayName(activeDay)}</h2>
            )}
            <button
              onClick={() => navigate(`/live-workout?day=${activeDay}`)}
              className="btn-volt px-5 py-2.5 text-sm flex items-center gap-2"
            >
              <Play className="w-4 h-4" fill="currentColor" /> התחל אימון
            </button>
          </div>
          <div className="space-y-2">
            {getDayExercises(activeDay).map((ex, i) => (
              <div key={i} className="card-glass card-hover p-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-volt-soft text-volt flex items-center justify-center shrink-0">
                  <Dumbbell className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-text-hi text-sm">{ex.name}</p>
                  <p className="text-text-mid text-xs">{ex.muscle_group}{ex.notes ? ` · ${ex.notes}` : ''}</p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-text-mid text-xs">סטים X חזרות</p>
                  <p className="text-text-hi text-sm font-bold tabular-nums" dir="ltr">{ex.sets} x {ex.reps}</p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-text-mid text-xs">משקל אחרון</p>
                  <p className="text-volt text-sm font-bold tabular-nums" dir="ltr">
                    {(lastWeights[ex.name] ?? ex.weight_kg) ? `${lastWeights[ex.name] ?? ex.weight_kg}kg` : '—'}
                  </p>
                </div>
                <ChevronLeft className="w-4 h-4 text-text-mid shrink-0" />
              </div>
            ))}
          </div>

          {/* Promo banner */}
          <div className="relative rounded-card overflow-hidden h-40 ring-1 ring-line">
            <img
              src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=400&fit=crop&q=80"
              alt="חדר כושר"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 to-transparent flex flex-col justify-end p-4">
              <p className="text-text-hi text-base font-extrabold">ההתמדה היא המפתח לתוצאות</p>
              <p className="text-text-mid text-xs">מוטיבציה יומית</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
