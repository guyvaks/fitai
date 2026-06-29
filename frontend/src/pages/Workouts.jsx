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

export default function Workouts() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeDay, setActiveDay] = useState('sunday')
  const [generating, setGenerating] = useState(false)
  const [taskId, setTaskId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [genError, setGenError] = useState(null)
  const progressRef = useRef(null)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-muted text-lg">טוען תכנית אימונים...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-main">תכנית האימונים שלך</h1>
        <div className="flex gap-2">
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {generating ? '⏳ יוצר תכנית...' : '🤖 בנה לי עם AI'}
          </button>
          <button className="bg-surface border border-border text-text-main px-4 py-2 rounded-lg font-medium text-sm hover:bg-surface/80 transition-colors">
            ✏️ בנה ידנית
          </button>
        </div>
      </div>

      {/* Generating state */}
      {generating && (
        <div className="bg-surface rounded-card p-6 text-center space-y-4">
          <div className="text-4xl">{done ? '✅' : '🏋️'}</div>
          <p className={`font-medium transition-colors duration-300 ${done ? 'text-green-400' : 'text-text-main'}`}>
            {done ? 'הושלם! עובר לתכנית...' : 'ה-AI בונה את תכנית האימונים שלך...'}
          </p>
          {!done && <p className="text-text-muted text-sm">כ-20–40 שניות</p>}
          <div className="space-y-1.5">
            <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ease-out ${done ? 'bg-green-500' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs font-medium text-left transition-colors ${done ? 'text-green-400' : 'text-text-muted'}`}>
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
                    completed ? 'text-green-400' : active ? 'text-text-main' : 'text-text-muted/40'
                  }`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-300 ${
                      completed ? 'bg-green-500 text-white' : active ? 'bg-primary text-white' : 'bg-slate-700 text-slate-500'
                    }`}>
                      {completed ? '✓' : step.num}
                    </span>
                    <span>{step.label}</span>
                    {active    && <span className="text-primary animate-pulse mr-auto">בתהליך...</span>}
                    {completed && <span className="text-green-400 mr-auto">הושלם</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {genError && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-card p-4 text-red-400 text-sm">
          {genError}
        </div>
      )}

      {/* Day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDay(d.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[40px] ${
              activeDay === d.key
                ? 'bg-primary text-white'
                : 'bg-surface text-text-muted hover:text-text-main'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Day content */}
      {!plan ? (
        <div className="bg-surface rounded-card p-10 text-center space-y-4">
          <div className="text-5xl">🏋️</div>
          <p className="text-text-muted text-lg">לא הגדרת תכנית אימונים עדיין</p>
          <button
            onClick={handleGenerateAI}
            disabled={generating}
            className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            🤖 בנה עם AI
          </button>
        </div>
      ) : isRestDay(activeDay) ? (
        <div className="bg-surface rounded-card p-10 text-center space-y-2">
          <div className="text-5xl">😴</div>
          <p className="text-text-main text-xl font-semibold mt-3">יום מנוחה</p>
          <p className="text-text-muted">המנוחה היא חלק חשוב מהאימון</p>
        </div>
      ) : (
        <div className="space-y-4">
          {getDayName(activeDay) && (
            <h2 className="text-lg font-semibold text-text-main">{getDayName(activeDay)}</h2>
          )}
          <div className="space-y-3">
            {getDayExercises(activeDay).map((ex, i) => (
              <div key={i} className="bg-surface rounded-card p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-main text-base">{ex.name}</span>
                  <span className="text-xs text-text-muted bg-surface/80 border border-border px-2 py-1 rounded">{ex.muscle_group}</span>
                </div>
                <p className="text-text-muted text-sm">
                  {ex.sets} סטים × {ex.reps} חזרות
                  {ex.weight_kg ? ` × ${ex.weight_kg} ק״ג` : ''}
                </p>
                {ex.rest_seconds && (
                  <p className="text-text-muted text-xs">מנוחה: {ex.rest_seconds} שניות</p>
                )}
                {ex.notes && (
                  <p className="text-text-muted text-xs italic">הערות: {ex.notes}</p>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate(`/live-workout?day=${activeDay}`)}
            className="w-full bg-primary hover:bg-primary/90 text-white py-4 rounded-card font-bold text-lg transition-colors min-h-[56px]"
          >
            🏃 התחל אימון
          </button>
        </div>
      )}
    </div>
  )
}
