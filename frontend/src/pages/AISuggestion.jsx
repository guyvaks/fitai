import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentsAPI } from '../services/api'

const STATUS_BADGE = {
  pending: { label: 'ממתין לאישורך', color: 'bg-blue-50 text-accent-blue border-blue-200' },
  approved: { label: 'אושר', color: 'bg-green-50 text-green-600 border-green-200' },
  rejected: { label: 'נדחה', color: 'bg-red-50 text-red-600 border-red-200' },
}

const DAYS_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const DAYS_HE = {
  sunday: "א'", monday: "ב'", tuesday: "ג'",
  wednesday: "ד'", thursday: "ה'", friday: "ו'", saturday: "שבת",
}

const DAYS_HE_FULL = {
  sunday: 'ראשון', monday: 'שני', tuesday: 'שלישי',
  wednesday: 'רביעי', thursday: 'חמישי', friday: 'שישי', saturday: 'שבת',
}

const MEAL_NAMES = {
  breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב', snack: 'ביניים', pre_workout: 'לפני אימון', post_workout: 'אחרי אימון',
}

const WORKOUT_TYPE_HE = {
  strength: 'כוח', cardio: 'אירובי', hiit: 'HIIT',
  flexibility: 'גמישות', rest: 'מנוחה', active_recovery: 'התאוששות פעילה',
}

// ─── Macro pill ───────────────────────────────────────────────────────────────
function MacroPill({ label, value, unit = 'ג', color }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label} <strong>{value}</strong>{unit}
    </span>
  )
}

// ─── Full Meal Plan ───────────────────────────────────────────────────────────
function MealPlanFull({ mealPlan, dailyTotals }) {
  const [activeDay, setActiveDay] = useState(DAYS_ORDER[0])
  const days = DAYS_ORDER.filter(d => mealPlan[d] && mealPlan[d].length > 0)

  const meals = mealPlan[activeDay] || []
  const totals = dailyTotals?.[activeDay] || null

  return (
    <div className="space-y-4 min-w-0">
      {/* Day tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {days.map(day => (
          <button
            key={day}
            onClick={() => setActiveDay(day)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeDay === day
                ? 'bg-accent-blue text-white shadow-sm'
                : 'bg-gray-100 text-dark-text-muted hover:bg-gray-200 hover:text-dark-text'
            }`}
          >
            יום {DAYS_HE[day]}
          </button>
        ))}
      </div>

      {/* Day header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <h4 className="text-dark-text font-semibold text-base shrink-0">
          יום {DAYS_HE_FULL[activeDay]}
        </h4>
        {totals && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            <MacroPill label="קק״ל" value={totals.calories} unit="" color="bg-orange-50 text-orange-600" />
            <MacroPill label="חלבון" value={totals.protein} color="bg-blue-50 text-blue-600" />
            <MacroPill label="פחמימות" value={totals.carbs} color="bg-yellow-50 text-yellow-600" />
            <MacroPill label="שומן" value={totals.fat} color="bg-purple-50 text-purple-600" />
          </div>
        )}
      </div>

      {/* Meals */}
      <div className="space-y-3">
        {meals.map((meal, i) => (
          <div key={i} className="bg-white border border-light-border rounded-xl p-4 space-y-3 min-w-0 shadow-sm">
            {/* Meal header */}
            <div className="flex items-start gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <p className="text-dark-text font-semibold text-sm">{meal.name || MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
                <p className="text-dark-text-muted text-xs mt-0.5">{MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
              </div>
            </div>
            {/* Meal macros */}
            <div className="flex gap-1.5 flex-wrap">
              <MacroPill label="קק״ל" value={meal.total_calories} unit="" color="bg-orange-50 text-orange-600" />
              <MacroPill label="חלבון" value={meal.total_protein} color="bg-blue-50 text-blue-600" />
              <MacroPill label="פחמימות" value={meal.total_carbs} color="bg-yellow-50 text-yellow-600" />
              <MacroPill label="שומן" value={meal.total_fat} color="bg-purple-50 text-purple-600" />
            </div>

            {/* Ingredients */}
            {meal.items && meal.items.length > 0 && (
              <div className="border-t border-light-border pt-3">
                <p className="text-dark-text-muted text-xs font-medium mb-2">מרכיבים:</p>
                <div className="space-y-1.5">
                  {meal.items.map((item, j) => (
                    <div key={j} className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-dark-text text-xs truncate">{item.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-dark-text-muted text-xs">{item.qty_g}ג׳</span>
                        <span className="text-orange-600 text-xs font-medium">{item.calories} קק״ל</span>
                        <span className="text-blue-600 text-xs">ח׳ {item.protein}ג׳</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Full Workout Plan ────────────────────────────────────────────────────────
function WorkoutPlanFull({ workoutPlan }) {
  const [activeDay, setActiveDay] = useState(DAYS_ORDER[0])
  const days = DAYS_ORDER.filter(d => workoutPlan[d])

  const workout = workoutPlan[activeDay]
  const isRest = !workout || !workout.exercises || workout.exercises.length === 0

  return (
    <div className="space-y-4 min-w-0">
      {/* Day tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {days.map(day => {
          const w = workoutPlan[day]
          const rest = !w || !w.exercises || w.exercises.length === 0
          return (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeDay === day
                  ? 'bg-accent-blue text-white shadow-sm'
                  : 'bg-gray-100 text-dark-text-muted hover:bg-gray-200 hover:text-dark-text'
              }`}
            >
              יום {DAYS_HE[day]}{rest ? ' 😴' : ''}
            </button>
          )
        })}
      </div>

      {/* Workout header */}
      {workout && (
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h4 className="text-dark-text font-semibold text-base">{workout.name || 'אימון'}</h4>
          {workout.type && (
            <span className="bg-blue-50 text-accent-blue text-xs px-2 py-0.5 rounded-full font-medium">
              {WORKOUT_TYPE_HE[workout.type] || workout.type}
            </span>
          )}
        </div>
      )}

      {/* Rest day */}
      {isRest && (
        <div className="bg-white border border-light-border rounded-xl p-6 text-center shadow-sm">
          <p className="text-4xl mb-2">😴</p>
          <p className="text-dark-text-muted text-sm">יום מנוחה — תנוח והתאושש</p>
        </div>
      )}

      {/* Exercises */}
      {!isRest && workout.exercises && (
        <div className="space-y-2">
          {workout.exercises.map((ex, i) => (
            <div key={i} className="bg-white border border-light-border rounded-xl p-4 min-w-0 shadow-sm">
              <div className="flex items-start gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-dark-text font-medium text-sm">{ex.name}</p>
                  {ex.muscle_group && (
                    <span className="inline-block bg-gray-100 text-dark-text-muted text-xs px-2 py-0.5 rounded-full mt-1">{ex.muscle_group}</span>
                  )}
                  {ex.notes && (
                    <p className="text-dark-text-muted text-xs mt-1">{ex.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap mt-2">
                <span className="bg-blue-50 text-accent-blue text-xs px-2 py-1 rounded-lg font-medium">
                  {ex.sets} × {ex.reps}
                </span>
                {ex.weight_kg > 0 && (
                  <span className="bg-yellow-50 text-yellow-600 text-xs px-2 py-1 rounded-lg font-medium">
                    {ex.weight_kg} ק״ג
                  </span>
                )}
                {ex.rest_seconds > 0 && (
                  <span className="bg-gray-100 text-dark-text-muted text-xs px-2 py-1 rounded-lg">
                    מנוחה {ex.rest_seconds}שנ׳
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Grocery List ─────────────────────────────────────────────────────────────
function GroceryList({ items }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span key={i} className="bg-white text-dark-text-muted text-xs px-3 py-1.5 rounded-full border border-light-border hover:border-accent-blue/30 transition-colors">
          {item}
        </span>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AISuggestion() {
  const navigate = useNavigate()
  const [suggestion, setSuggestion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [activeTab, setActiveTab] = useState(() =>
    // will be overridden after load, but start with nutrition
    'nutrition'
  )

  useEffect(() => {
    agentsAPI.getPending()
      .then(r => {
        const item = r.data?.[0] || null
        setSuggestion(item)
        if (item?.content) {
          const c = item.content
          if (c.meal_plan) setActiveTab('nutrition')
          else if (c.workout_plan) setActiveTab('workout')
        }
      })
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
      navigate('/dashboard', { replace: true })
    } catch {
      setSuggestion(null)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-light-bg rounded-card">
        <p className="text-dark-text-muted">טוען...</p>
      </div>
    )
  }

  if (!suggestion) {
    return (
      <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
        <h2 className="text-2xl font-bold text-dark-text">הצעות AI</h2>
        <div className="bg-white border border-light-border rounded-card p-10 text-center space-y-4 shadow-sm">
          <div className="text-5xl">🤖</div>
          <p className="text-dark-text font-medium">אין הצעות ממתינות לאישור</p>
          <button
            onClick={() => navigate('/nutrition')}
            className="bg-accent-blue text-white px-6 py-2 rounded-lg font-medium text-sm hover:bg-accent-blue/90 transition shadow-sm"
          >
            צור תכנית חדשה עם AI
          </button>
        </div>
      </div>
    )
  }

  // Normalise content — handle all shapes the AI might return
  function normaliseContent(raw) {
    if (!raw || typeof raw !== 'object') return {}

    // Already has plan keys — ideal case
    if (raw.meal_plan || raw.workout_plan) return raw

    // Has raw_output string — try to parse it
    if (raw.raw_output) {
      try {
        const parsed = JSON.parse(raw.raw_output)
        if (parsed && typeof parsed === 'object') {
          if (parsed.meal_plan || parsed.workout_plan) return parsed
          // parsed is a single meal object — wrap it
          if (parsed.meal_type || parsed.items) {
            return { meal_plan: { sunday: [parsed] } }
          }
          return parsed
        }
      } catch { /* fall through */ }
    }

    // Content itself is a single meal object (meal_type / items keys)
    if (raw.meal_type || raw.items) {
      return { meal_plan: { sunday: [raw] } }
    }

    // Has meals array directly
    if (Array.isArray(raw.meals)) {
      return { meal_plan: { sunday: raw.meals } }
    }

    // Has content nested one level deeper
    if (raw.content && typeof raw.content === 'object') {
      return normaliseContent(raw.content)
    }

    return raw
  }

  const content = normaliseContent(suggestion.content || {})
  const badge = STATUS_BADGE[suggestion.status] || STATUS_BADGE.pending
  const hasMeal = !!content.meal_plan
  const hasWorkout = !!content.workout_plan
  const hasNoContent = !hasMeal && !hasWorkout

  return (
    <div className="space-y-6 pb-8 overflow-x-hidden bg-light-bg p-6 rounded-card" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h2 className="text-2xl font-bold text-dark-text truncate">הצעות AI</h2>
        <span className={`text-xs px-3 py-1 rounded-full border font-medium shrink-0 ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {/* Summary card */}
      <div className="bg-white border border-light-border rounded-card p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-2 min-w-0">
          <span className="text-2xl shrink-0">🤖</span>
          <div className="min-w-0">
            <p className="text-dark-text font-semibold">
              {hasMeal && hasWorkout ? 'ה-AI הכין לך תפריט תזונה ותכנית אימונים שבועית'
                : hasMeal ? 'ה-AI הכין לך תפריט תזונה שבועי'
                : 'ה-AI הכין לך תכנית אימונים שבועית'}
            </p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {hasMeal && <span className="text-xs bg-blue-50 text-accent-blue px-2 py-0.5 rounded-full">🥗 תזונה ל-7 ימים</span>}
              {hasWorkout && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">💪 אימונים ל-7 ימים</span>}
              {content.grocery_list?.length > 0 && <span className="text-xs bg-gray-100 text-dark-text-muted px-2 py-0.5 rounded-full">🛒 {content.grocery_list.length} פריטי קניות</span>}
            </div>
          </div>
        </div>
        {content.summary && (
          <p className="text-dark-text-muted text-sm leading-relaxed mt-2">{content.summary}</p>
        )}
      </div>

      {/* No content warning */}
      {hasNoContent && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-card p-4 space-y-2">
          <p className="text-yellow-700 text-sm font-semibold">⚠️ לא נמצא תוכן מובנה</p>
          <p className="text-yellow-600/80 text-xs">מפתחות: {Object.keys(suggestion.content || {}).join(', ') || 'ריק'}</p>
          {suggestion.content?.error && (
            <p className="text-red-600 text-xs">שגיאה: {suggestion.content.error}</p>
          )}
        </div>
      )}

      {/* Tab switcher — shown only when there's parseable content */}
      {!hasNoContent && <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {hasMeal && (
          <button
            onClick={() => setActiveTab('nutrition')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'nutrition'
                ? 'bg-white text-dark-text shadow-sm'
                : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            🥗 תפריט תזונה
          </button>
        )}
        {hasWorkout && (
          <button
            onClick={() => setActiveTab('workout')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'workout'
                ? 'bg-white text-dark-text shadow-sm'
                : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            💪 תכנית אימונים
          </button>
        )}
        {content.grocery_list?.length > 0 && (
          <button
            onClick={() => setActiveTab('grocery')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'grocery'
                ? 'bg-white text-dark-text shadow-sm'
                : 'text-dark-text-muted hover:text-dark-text'
            }`}
          >
            🛒 קניות
          </button>
        )}
      </div>}

      {/* Meal Plan */}
      {activeTab === 'nutrition' && hasMeal && (
        <div className="bg-white border border-light-border rounded-card p-4 space-y-4 shadow-sm">
          <h3 className="text-dark-text font-semibold flex items-center gap-2">
            <span>🥗</span> תפריט שבועי מלא
          </h3>
          <MealPlanFull
            mealPlan={content.meal_plan}
            dailyTotals={content.daily_totals}
          />
        </div>
      )}

      {/* Workout Plan */}
      {activeTab === 'workout' && hasWorkout && (
        <div className="bg-white border border-light-border rounded-card p-4 space-y-4 shadow-sm">
          <h3 className="text-dark-text font-semibold flex items-center gap-2">
            <span>💪</span> תכנית אימונים שבועית מלאה
          </h3>
          <WorkoutPlanFull workoutPlan={content.workout_plan} />
        </div>
      )}

      {/* Grocery */}
      {activeTab === 'grocery' && content.grocery_list?.length > 0 && (
        <div className="bg-white border border-light-border rounded-card p-4 space-y-3 shadow-sm">
          <h3 className="text-dark-text font-semibold flex items-center gap-2">
            <span>🛒</span> רשימת קניות ({content.grocery_list.length} פריטים)
          </h3>
          <GroceryList items={content.grocery_list} />
        </div>
      )}

      {/* Action buttons — after full content review */}
      {suggestion.status === 'pending' && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleApprove}
            disabled={actionLoading}
            className="flex-1 bg-accent-blue text-white py-3 rounded-xl font-semibold text-sm hover:bg-accent-blue/90 disabled:opacity-50 transition shadow-sm"
          >
            {actionLoading ? 'מעבד...' : '✅ אשר ואמץ את התכנית'}
          </button>
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="flex-1 bg-red-50 text-red-600 border border-red-200 py-3 rounded-xl font-semibold text-sm hover:bg-red-100 disabled:opacity-50 transition"
          >
            ❌ דחה וצור חדש
          </button>
        </div>
      )}

    </div>
  )
}
