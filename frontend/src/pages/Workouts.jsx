import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { workoutsAPI, agentsAPI } from '../services/api'
import { usePolling } from '../hooks/usePolling'

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

  const isRestDay = (day) => {
    const exercises = getDayExercises(day)
    if (exercises.length === 0) return true
    if (plan?.plan_data?.[day]?.rest) return true
    return false
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
      <div className="flex items-center justify-center h-64 bg-light-bg rounded-card">
        <div className="text-dark-text-muted text-lg">טוען תכנית אימונים...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-text">תכנית האימונים שלך</h1>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="bg-accent-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-blue/90 disabled:opacity-50 transition shadow-sm"
          >
            {generating ? '⏳ יוצר תכנית...' : '🤖 בנה לי עם AI'}
          </button>
          <button className="bg-white border border-light-border text-dark-text px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors shadow-sm">
            ✏️ בנה ידנית
          </button>
        </div>
      </div>

      {/* Generating state */}
      {generating && (
        <div className="bg-white border border-light-border rounded-card p-6 text-center space-y-4 shadow-sm">
          <div className="text-4xl">{done ? '✅' : '🏋️'}</div>
          <p className={`font-medium transition-colors duration-300 ${done ? 'text-green-600' : 'text-dark-text'}`}>
            {done ? 'הושלם! עובר לתכנית...' : 'ה-AI בונה את תכנית האימונים שלך...'}
          </p>
          {!done && <p className="text-dark-text-muted text-sm">כ-20–40 שניות</p>}
          <div className="space-y-1.5">
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ease-out ${done ? 'bg-green-500' : 'bg-accent-blue'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs font-medium text-left transition-colors ${done ? 'text-green-600' : 'text-dark-text-muted'}`}>
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
                    completed ? 'text-green-600' : active ? 'text-dark-text' : 'text-dark-text-muted/40'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                      completed ? 'bg-green-500 text-white' : active ? 'bg-accent-blue text-white' : 'bg-gray-200 text-gray-400'
                    }`}>
                      {completed ? '✓' : step.num}
                    </span>
                    <span>{step.label}</span>
                    {active    && <span className="text-accent-blue animate-pulse mr-auto">בתהליך...</span>}
                    {completed && <span className="text-green-600 mr-auto">הושלם</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {genError && (
        <div className="bg-red-50 border border-red-200 rounded-card p-4 text-red-600 text-sm">
          {genError}
        </div>
      )}

      {/* Date strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {weekDates.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDay(d.key)}
            className={`flex flex-col items-center justify-center w-12 h-14 rounded-xl shrink-0 transition-colors ${
              activeDay === d.key ? 'bg-accent-blue text-white' : 'bg-white border border-light-border text-dark-text'
            }`}
          >
            <span className="text-xs opacity-80">{DAYS.find(x => x.key === d.key)?.label.slice(0, 1)}</span>
            <span className="text-base font-bold">{d.dayOfMonth}</span>
            {!isRestDay(d.key) && (
              <span className={`w-1 h-1 rounded-full mt-0.5 ${activeDay === d.key ? 'bg-white' : 'bg-accent-blue'}`} />
            )}
          </button>
        ))}
      </div>

      {/* Day name tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDay(d.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors min-h-[40px] ${
              activeDay === d.key
                ? 'bg-accent-blue text-white shadow-sm'
                : 'bg-gray-100 text-dark-text-muted hover:text-dark-text'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Day content */}
      {!plan ? (
        <div className="bg-white border border-light-border rounded-card p-10 text-center space-y-4 shadow-sm">
          <div className="text-5xl">🏋️</div>
          <p className="text-dark-text-muted text-lg">לא הגדרת תכנית אימונים עדיין</p>
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="bg-accent-blue hover:bg-accent-blue/90 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            🤖 בנה עם AI
          </button>
        </div>
      ) : isRestDay(activeDay) ? (
        <div className="bg-white border border-light-border rounded-card p-10 text-center space-y-2 shadow-sm">
          <div className="text-5xl">😴</div>
          <p className="text-dark-text text-xl font-semibold mt-3">יום מנוחה</p>
          <p className="text-dark-text-muted">המנוחה היא חלק חשוב מהאימון</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {getDayName(activeDay) && (
              <h2 className="text-lg font-semibold text-dark-text">{getDayName(activeDay)}</h2>
            )}
            <button
              onClick={() => navigate(`/live-workout?day=${activeDay}`)}
              className="bg-accent-blue hover:bg-accent-blue/90 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors shadow-sm flex items-center gap-2"
            >
              ▶ התחל אימון
            </button>
          </div>
          <div className="space-y-2">
            {getDayExercises(activeDay).map((ex, i) => (
              <div key={i} className="bg-white border border-light-border rounded-card p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
                <span className="w-10 h-10 rounded-full bg-blue-50 text-accent-blue flex items-center justify-center text-lg shrink-0">💪</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-dark-text text-sm">{ex.name}</p>
                  <p className="text-dark-text-muted text-xs">{ex.muscle_group}{ex.notes ? ` · ${ex.notes}` : ''}</p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-dark-text-muted text-xs">סטים X חזרות</p>
                  <p className="text-dark-text text-sm font-bold" dir="ltr">{ex.sets} x {ex.reps}</p>
                </div>
                <div className="text-center shrink-0">
                  <p className="text-dark-text-muted text-xs">משקל אחרון</p>
                  <p className="text-green-600 text-sm font-bold" dir="ltr">
                    {(lastWeights[ex.name] ?? ex.weight_kg) ? `${lastWeights[ex.name] ?? ex.weight_kg}kg` : '—'}
                  </p>
                </div>
                <span className="text-dark-text-muted shrink-0">‹</span>
              </div>
            ))}
          </div>

          {/* Promo banner */}
          <div className="relative rounded-card overflow-hidden h-40 shadow-sm">
            <img
              src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&h=400&fit=crop&q=80"
              alt="חדר כושר"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex flex-col justify-end p-4">
              <p className="text-white text-base font-bold">ההתמדה היא המפתח לתוצאות</p>
              <p className="text-white/80 text-xs">מוטיבציה יומית</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
