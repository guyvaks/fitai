import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { workoutsAPI } from '../services/api'

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

  useEffect(() => {
    workoutsAPI.getPlan()
      .then(({ data }) => setPlan(data))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false))
  }, [])

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
            onClick={() => navigate('/live-workout?day=' + activeDay)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            🤖 בנה לי AI
          </button>
          <button className="bg-surface border border-border text-text-main px-4 py-2 rounded-lg font-medium text-sm hover:bg-surface/80 transition-colors">
            ✏️ בנה ידנית
          </button>
        </div>
      </div>

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
            onClick={() => navigate('/live-workout?day=' + activeDay)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
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
