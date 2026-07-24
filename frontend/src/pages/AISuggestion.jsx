import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentsAPI } from '../services/api'
import { Bot, Salad, Dumbbell, ShoppingCart, Moon, Check, X, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react'

const STATUS_BADGE = {
  pending: { label: 'ממתין לאישורך', color: 'bg-cyan-soft text-cyan border-cyan/30' },
  approved: { label: 'אושר', color: 'bg-volt-soft text-volt border-volt/30' },
  rejected: { label: 'נדחה', color: 'bg-coral-soft text-coral border-coral/30' },
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
            className={`px-3 py-1.5 rounded-elem text-sm font-medium transition-all ${
              activeDay === day
                ? 'bg-volt text-ink'
                : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
            }`}
          >
            יום {DAYS_HE[day]}
          </button>
        ))}
      </div>

      {/* Day header */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <h4 className="text-text-hi font-bold text-base shrink-0">
          יום {DAYS_HE_FULL[activeDay]}
        </h4>
        {totals && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            <MacroPill label="קק״ל" value={totals.calories} unit="" color="bg-coral-soft text-coral" />
            <MacroPill label="חלבון" value={totals.protein} color="bg-volt-soft text-volt" />
            <MacroPill label="פחמימות" value={totals.carbs} color="bg-cyan-soft text-cyan" />
            <MacroPill label="שומן" value={totals.fat} color="bg-amber-soft text-amber" />
          </div>
        )}
      </div>

      {/* Meals */}
      <div className="space-y-3">
        {meals.map((meal, i) => (
          <div key={i} className="bg-white/4 border border-line rounded-xl p-4 space-y-3 min-w-0">
            {/* Meal header */}
            <div className="flex items-start gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <p className="text-text-hi font-bold text-sm">{meal.name || MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
                <p className="text-text-mid text-xs mt-0.5">{MEAL_NAMES[meal.meal_type] || meal.meal_type}</p>
              </div>
            </div>
            {/* Meal macros */}
            <div className="flex gap-1.5 flex-wrap">
              <MacroPill label="קק״ל" value={meal.total_calories} unit="" color="bg-coral-soft text-coral" />
              <MacroPill label="חלבון" value={meal.total_protein} color="bg-volt-soft text-volt" />
              <MacroPill label="פחמימות" value={meal.total_carbs} color="bg-cyan-soft text-cyan" />
              <MacroPill label="שומן" value={meal.total_fat} color="bg-amber-soft text-amber" />
            </div>

            {/* Ingredients */}
            {meal.items && meal.items.length > 0 && (
              <div className="border-t border-line pt-3">
                <p className="text-text-mid text-xs font-medium mb-2">מרכיבים:</p>
                <div className="space-y-1.5">
                  {meal.items.map((item, j) => (
                    <div key={j} className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-text-hi text-xs truncate">{item.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-text-mid text-xs"><span dir="ltr">{item.qty_g}</span>ג׳</span>
                        <span className="text-coral text-xs font-medium"><span dir="ltr">{item.calories}</span> קק״ל</span>
                        <span className="text-volt text-xs">ח׳ <span dir="ltr">{item.protein}</span>ג׳</span>
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
              className={`px-3 py-1.5 rounded-elem text-sm font-medium transition-all inline-flex items-center gap-1 ${
                activeDay === day
                  ? 'bg-volt text-ink'
                  : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
              }`}
            >
              יום {DAYS_HE[day]}{rest && <Moon className="w-3 h-3 opacity-70" />}
            </button>
          )
        })}
      </div>

      {/* Workout header */}
      {workout && (
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h4 className="text-text-hi font-bold text-base">{workout.name || 'אימון'}</h4>
          {workout.type && (
            <span className="bg-cyan-soft text-cyan text-xs px-2 py-0.5 rounded-full font-medium">
              {WORKOUT_TYPE_HE[workout.type] || workout.type}
            </span>
          )}
        </div>
      )}

      {/* Rest day */}
      {isRest && (
        <div className="bg-white/4 border border-line rounded-xl p-6 text-center">
          <div className="flex justify-center mb-2">
            <span className="w-10 h-10 rounded-full bg-cyan-soft text-cyan flex items-center justify-center">
              <Moon className="w-5 h-5" />
            </span>
          </div>
          <p className="text-text-mid text-sm">יום מנוחה — תנוח והתאושש</p>
        </div>
      )}

      {/* Exercises */}
      {!isRest && workout.exercises && (
        <div className="space-y-2">
          {workout.exercises.map((ex, i) => (
            <div key={i} className="bg-white/4 border border-line rounded-xl p-4 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-text-hi font-medium text-sm">{ex.name}</p>
                  {ex.muscle_group && (
                    <span className="inline-block bg-white/6 text-text-mid text-xs px-2 py-0.5 rounded-full mt-1">{ex.muscle_group}</span>
                  )}
                  {ex.notes && (
                    <p className="text-text-mid text-xs mt-1">{ex.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap mt-2">
                <span className="bg-volt-soft text-volt text-xs px-2 py-1 rounded-lg font-medium tabular-nums" dir="ltr">
                  {ex.sets} × {ex.reps}
                </span>
                {ex.weight_kg > 0 && (
                  <span className="bg-amber-soft text-amber text-xs px-2 py-1 rounded-lg font-medium">
                    <span dir="ltr">{ex.weight_kg}</span> ק״ג
                  </span>
                )}
                {ex.rest_seconds > 0 && (
                  <span className="bg-white/6 text-text-mid text-xs px-2 py-1 rounded-lg">
                    מנוחה <span dir="ltr">{ex.rest_seconds}</span>שנ׳
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
        <span key={i} className="bg-white/4 text-text-mid text-xs px-3 py-1.5 rounded-full border border-line hover:border-volt/30 hover:text-text-hi transition-colors">
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
  const [approved, setApproved] = useState(false)
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
      // Confirm the adoption before leaving the page, then route to whichever
      // plan was actually adopted — a workout-only suggestion used to dump the
      // user on /nutrition with no feedback (UX-8).
      const c = normaliseContent(suggestion.content || {})
      const dest = c.workout_plan && !c.meal_plan ? '/workouts' : '/nutrition'
      setApproved(true)
      setTimeout(() => navigate(dest), 1500)
    } catch (e) {
      const detail = e.response?.data?.detail
      const message = detail && typeof detail === 'object' && detail.error_type === 'no_plan_generated'
        ? 'יצירת התוכנית נכשלה, נסה ליצור מחדש'
        : (typeof detail === 'string' && detail) || 'שגיאה באישור'
      alert(message)
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
      <div className="flex items-center justify-center gap-2 h-64 card-glass">
        <Loader2 className="w-5 h-5 animate-spin text-volt" />
        <p className="text-text-mid">טוען...</p>
      </div>
    )
  }

  // Success confirmation after adopting a plan — content-aware so the user
  // gets explicit feedback for a workout, a menu, or both (UX-8).
  if (approved) {
    const c = normaliseContent(suggestion?.content || {})
    const adoptedMeal = !!c.meal_plan
    const adoptedWorkout = !!c.workout_plan
    const title = adoptedMeal && adoptedWorkout
      ? 'התפריט ותכנית האימונים אומצו בהצלחה!'
      : adoptedWorkout
        ? 'תכנית האימונים אומצה בהצלחה!'
        : 'התפריט אומץ בהצלחה!'
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64 card-glass text-center anim-rise" dir="rtl">
        <span className="w-16 h-16 rounded-full bg-volt-soft text-volt flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </span>
        <div>
          <p className="text-text-hi font-bold text-lg">{title}</p>
          <p className="text-text-mid text-sm mt-1 inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-volt" />
            מעבירים אותך לתכנית שלך...
          </p>
        </div>
      </div>
    )
  }

  if (!suggestion) {
    return (
      <div className="space-y-6" dir="rtl">
        <h2 className="text-3xl font-extrabold text-text-hi tracking-tight anim-rise">הצעות AI</h2>
        <div className="card-glass p-10 text-center space-y-4 anim-rise anim-d1">
          <div className="flex justify-center">
            <span className="w-14 h-14 rounded-full bg-volt-soft text-volt flex items-center justify-center">
              <Bot className="w-7 h-7" />
            </span>
          </div>
          <p className="text-text-hi font-bold">אין הצעות ממתינות לאישור</p>
          <button
            onClick={() => navigate('/nutrition')}
            className="btn-volt px-6 py-2 text-sm"
          >
            צור תכנית חדשה עם AI
          </button>
        </div>
      </div>
    )
  }

  // Normalise content — unwraps the shapes the AI response can be nested in
  // (raw_output string, content one level deeper). Deliberately does NOT
  // synthesise a fake single-day plan from a lone meal object — that used to
  // silently turn a failed/incomplete generation into what looked like a
  // legitimate one-day plan (the "1 day instead of 7" bug). If there's no
  // real meal_plan/workout_plan, this falls through to the existing
  // "no content" warning UI below instead of fabricating one.
  function normaliseContent(raw) {
    if (!raw || typeof raw !== 'object') return {}

    // Already has plan keys — ideal case
    if (raw.meal_plan || raw.workout_plan) return raw

    // Has raw_output string — try to parse it
    if (raw.raw_output) {
      try {
        const parsed = JSON.parse(raw.raw_output)
        if (parsed && typeof parsed === 'object' && (parsed.meal_plan || parsed.workout_plan)) {
          return parsed
        }
      } catch { /* fall through */ }
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
    <div className="space-y-6 pb-8 overflow-x-hidden" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 min-w-0 anim-rise">
        <h2 className="text-3xl font-extrabold text-text-hi tracking-tight truncate">הצעות AI</h2>
        <span className={`text-xs px-3 py-1 rounded-full border font-medium shrink-0 ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {/* Summary card */}
      <div className="card-glass p-4 anim-rise anim-d1">
        <div className="flex items-center gap-3 mb-2 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-volt-soft text-volt flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-text-hi font-bold">
              {hasMeal && hasWorkout ? 'ה-AI הכין לך תפריט תזונה ותכנית אימונים שבועית'
                : hasMeal ? 'ה-AI הכין לך תפריט תזונה שבועי'
                : 'ה-AI הכין לך תכנית אימונים שבועית'}
            </p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {hasMeal && <span className="text-xs bg-volt-soft text-volt px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Salad className="w-3 h-3" /> תזונה ל-7 ימים</span>}
              {hasWorkout && <span className="text-xs bg-cyan-soft text-cyan px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Dumbbell className="w-3 h-3" /> אימונים ל-7 ימים</span>}
              {content.grocery_list?.length > 0 && <span className="text-xs bg-white/6 text-text-mid px-2 py-0.5 rounded-full inline-flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> <span dir="ltr">{content.grocery_list.length}</span> פריטי קניות</span>}
            </div>
          </div>
        </div>
        {content.summary && (
          <p className="text-text-mid text-sm leading-relaxed mt-2">{content.summary}</p>
        )}
      </div>

      {/* No content warning — covers both the {"error": ...} shape from a
          total crew-generation failure and any other content missing both
          plan keys. Friendly message only; no raw error/keys shown to the
          user (see handleApprove/hasNoContent below). */}
      {hasNoContent && (
        <div className="bg-amber-soft border border-amber/30 rounded-card p-4 space-y-2">
          <p className="text-amber text-sm font-semibold inline-flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> יצירת התוכנית נכשלה, נסה ליצור מחדש</p>
        </div>
      )}

      {/* Tab switcher — shown only when there's parseable content */}
      {!hasNoContent && <div className="flex bg-white/4 border border-line rounded-xl p-1 gap-1">
        {hasMeal && (
          <button
            onClick={() => setActiveTab('nutrition')}
            className={`flex-1 py-2 rounded-elem text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'nutrition'
                ? 'bg-volt text-ink'
                : 'text-text-mid hover:text-text-hi'
            }`}
          >
            <Salad className="w-4 h-4" /> תפריט תזונה
          </button>
        )}
        {hasWorkout && (
          <button
            onClick={() => setActiveTab('workout')}
            className={`flex-1 py-2 rounded-elem text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'workout'
                ? 'bg-volt text-ink'
                : 'text-text-mid hover:text-text-hi'
            }`}
          >
            <Dumbbell className="w-4 h-4" /> תכנית אימונים
          </button>
        )}
        {content.grocery_list?.length > 0 && (
          <button
            onClick={() => setActiveTab('grocery')}
            className={`flex-1 py-2 rounded-elem text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'grocery'
                ? 'bg-volt text-ink'
                : 'text-text-mid hover:text-text-hi'
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> קניות
          </button>
        )}
      </div>}

      {/* Meal Plan */}
      {activeTab === 'nutrition' && hasMeal && (
        <div className="card-glass p-4 space-y-4">
          <h3 className="text-text-hi font-bold flex items-center gap-2">
            <Salad className="w-4.5 h-4.5 text-volt" /> תפריט שבועי מלא
          </h3>
          <MealPlanFull
            mealPlan={content.meal_plan}
            dailyTotals={content.daily_totals}
          />
        </div>
      )}

      {/* Workout Plan */}
      {activeTab === 'workout' && hasWorkout && (
        <div className="card-glass p-4 space-y-4">
          <h3 className="text-text-hi font-bold flex items-center gap-2">
            <Dumbbell className="w-4.5 h-4.5 text-cyan" /> תכנית אימונים שבועית מלאה
          </h3>
          <WorkoutPlanFull workoutPlan={content.workout_plan} />
        </div>
      )}

      {/* Grocery */}
      {activeTab === 'grocery' && content.grocery_list?.length > 0 && (
        <div className="card-glass p-4 space-y-3">
          <h3 className="text-text-hi font-bold flex items-center gap-2">
            <ShoppingCart className="w-4.5 h-4.5 text-amber" /> רשימת קניות (<span dir="ltr">{content.grocery_list.length}</span> פריטים)
          </h3>
          <GroceryList items={content.grocery_list} />
        </div>
      )}

      {/* Action buttons — after full content review */}
      {suggestion.status === 'pending' && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleApprove}
            disabled={actionLoading || hasNoContent}
            title={hasNoContent ? 'יצירת התוכנית נכשלה — אין תוכן תקין לאישור' : undefined}
            className="btn-volt flex-1 py-3 text-sm flex items-center justify-center gap-1.5"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {actionLoading ? 'מעבד...' : 'אשר ואמץ את התכנית'}
          </button>
          <button
            onClick={handleReject}
            disabled={actionLoading}
            className="flex-1 bg-coral-soft text-coral border border-coral/30 py-3 rounded-xl font-semibold text-sm hover:bg-coral/20 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
          >
            <X className="w-4 h-4" /> דחה וצור חדש
          </button>
        </div>
      )}

    </div>
  )
}
