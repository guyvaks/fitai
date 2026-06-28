import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentsAPI } from '../services/api'

const STATUS_BADGE = {
  pending: { label: 'ממתין לאישורך', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  approved: { label: 'אושר', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  rejected: { label: 'נדחה', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
}

const DAYS_HE = {
  sunday: 'ראשון', monday: 'שני', tuesday: 'שלישי',
  wednesday: 'רביעי', thursday: 'חמישי', friday: 'שישי', saturday: 'שבת',
}

const MEAL_NAMES = {
  breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב', snack: 'ביניים',
}

function MealPlanPreview({ mealPlan }) {
  const days = Object.keys(mealPlan).slice(0, 2)
  return (
    <div className="space-y-3">
      {days.map(day => (
        <div key={day}>
          <h4 className="text-text-muted text-xs uppercase mb-2 font-medium">יום {DAYS_HE[day] || day}</h4>
          <div className="space-y-2">
            {(mealPlan[day] || []).map((meal, i) => (
              <div key={i} className="bg-background rounded-lg p-3 flex justify-between items-start">
                <div>
                  <p className="text-text-main text-sm font-medium">{meal.name || MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
                  <p className="text-text-muted text-xs">{MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
                </div>
                <span className="text-primary text-sm font-bold">{meal.total_calories} קק"ל</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function WorkoutPlanPreview({ workoutPlan }) {
  const days = Object.keys(workoutPlan).slice(0, 2)
  return (
    <div className="space-y-3">
      {days.map(day => {
        const w = workoutPlan[day]
        if (!w) return null
        return (
          <div key={day}>
            <h4 className="text-text-muted text-xs uppercase mb-2 font-medium">יום {DAYS_HE[day] || day}</h4>
            <div className="bg-background rounded-lg p-3">
              <p className="text-text-main text-sm font-medium">{w.name || 'אימון'}</p>
              {w.exercises && w.exercises.length > 0 && (
                <div className="mt-2 space-y-1">
                  {w.exercises.slice(0, 3).map((ex, i) => (
                    <p key={i} className="text-text-muted text-xs">{ex.name} — {ex.sets}x{ex.reps}</p>
                  ))}
                  {w.exercises.length > 3 && (
                    <p className="text-text-muted text-xs">+{w.exercises.length - 3} תרגילים נוספים</p>
                  )}
                </div>
              )}
              {(!w.exercises || w.exercises.length === 0) && (
                <p className="text-text-muted text-xs mt-1">מנוחה</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AISuggestion() {
  const navigate = useNavigate()
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    agentsAPI.getPending()
      .then(r => setSuggestion(r.data?.[0] || null))
      .catch(() => setSuggestion(null))
      .finally(() => setLoading(false))
  }, [])

  const handleApprove = async () => {
    if (!suggestion) return
    setActionLoading(true)
    try {
      await agentsAPI.approve(suggestion.id)
      navigate('/nutrition')
    } catch (e) {
      alert(e.response?.data?.detail || 'שגיאה באישור')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!suggestion) return
    setActionLoading(true)
    try {
      await agentsAPI.reject(suggestion.id)
      setSuggestion(null)
    } catch {
      // ignore
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-muted">טוען...</p>
      </div>
    )
  }

  if (!suggestion) {
    return (
      <div className="space-y-6" dir="rtl">
        <h2 className="text-2xl font-bold text-text-main">הצעות AI</h2>
        <div className="bg-surface rounded-card p-10 text-center space-y-4">
          <div className="text-5xl">🤖</div>
          <p className="text-text-main font-medium">אין הצעות ממתינות לאישור</p>
          <button
            onClick={() => navigate('/nutrition')}
            className="bg-primary text-white px-6 py-2 rounded-lg font-medium text-sm hover:bg-primary/90 transition"
          >
            צור תכנית חדשה עם AI
          </button>
        </div>
      </div>
    )
  }

  const content = suggestion.content || {}
  const badge = STATUS_BADGE[suggestion.status] || STATUS_BADGE.pending

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-text-main">הצעות AI</h2>
        <span className={`text-xs px-3 py-1 rounded-full border font-medium ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      <div className="bg-surface rounded-card p-4">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🤖</span>
          <p className="text-text-main font-semibold">ה-AI הכין לך תפריט ותכנית אימונים</p>
        </div>
        {content.summary && (
          <p className="text-text-muted text-sm leading-relaxed">{content.summary}</p>
        )}
        {content.adjustments_made && content.adjustments_made.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-text-muted text-xs font-medium">התאמות שנעשו:</p>
            {content.adjustments_made.map((adj, i) => (
              <p key={i} className="text-text-muted text-xs">• {adj}</p>
            ))}
          </div>
        )}
      </div>

      {content.meal_plan && (
        <div className="bg-surface rounded-card p-4 space-y-3">
          <h3 className="text-text-main font-semibold flex items-center gap-2">
            <span>🥗</span> תפריט תזונה (תצוגה מקדימה)
          </h3>
          <MealPlanPreview mealPlan={content.meal_plan} />
        </div>
      )}

      {content.workout_plan && (
        <div className="bg-surface rounded-card p-4 space-y-3">
          <h3 className="text-text-main font-semibold flex items-center gap-2">
            <span>💪</span> תכנית אימונים (תצוגה מקדימה)
          </h3>
          <WorkoutPlanPreview workoutPlan={content.workout_plan} />
        </div>
      )}

      {content.grocery_list && content.grocery_list.length > 0 && (
        <div className="bg-surface rounded-card p-4 space-y-2">
          <h3 className="text-text-main font-semibold flex items-center gap-2">
            <span>🛒</span> רשימת קניות
          </h3>
          <div className="flex flex-wrap gap-2">
            {content.grocery_list.map((item, i) => (
              <span key={i} className="bg-background text-text-muted text-xs px-2 py-1 rounded-full">{item}</span>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {suggestion.status === 'pending' && (
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="flex-1 bg-primary text-white py-3 rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {actionLoading ? 'מעבד...' : '✅ אשר ואמץ את התכנית'}
          </button>
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="flex-1 bg-red-600/20 text-red-400 border border-red-600/30 py-3 rounded-lg font-medium hover:bg-red-600/30 disabled:opacity-50 transition"
          >
            ❌ דחה וצור חדש
          </button>
        </div>
      )}
    </div>
  )
}
