import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkoutSession } from '../hooks/useWorkoutSession'
import { workoutsAPI } from '../services/api'

const demoExercises = [
  { name: "לחיצת חזה", muscle_group: "חזה", sets: 4, reps: 10, weight_kg: 60, rest_seconds: 90 },
  { name: "מתח רחב", muscle_group: "גב", sets: 3, reps: 8, weight_kg: 0, rest_seconds: 120 },
  { name: "לחיצת כתפיים", muscle_group: "כתפיים", sets: 3, reps: 12, weight_kg: 30, rest_seconds: 90 },
  { name: "כפיפות מרפקים", muscle_group: "ביצפס", sets: 3, reps: 12, weight_kg: 15, rest_seconds: 60 },
  { name: "סקוואט", muscle_group: "רגליים", sets: 4, reps: 10, weight_kg: 80, rest_seconds: 120 },
]

function RestTimer({ restTimer, restActive, initialRest, skipRest, addTime }) {
  const circumference = 2 * Math.PI * 70
  const progress = initialRest > 0 ? restTimer / initialRest : 0

  if (!restActive && restTimer === 0) return null

  return (
    <div className="bg-white border border-light-border rounded-card p-6 text-center space-y-4 shadow-sm">
      <p className="text-dark-text-muted text-sm font-medium">זמן מנוחה</p>

      <div className="relative w-40 h-40 mx-auto">
        <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="70" fill="none" stroke="#E5E7EB" strokeWidth="8"/>
          <circle
            cx="80" cy="80" r="70" fill="none" stroke="#2563EB" strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-dark-text">
            {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <button
          onClick={() => addTime(-15)}
          className="bg-white border border-light-border text-dark-text-muted px-3 py-2 rounded-lg text-sm hover:text-dark-text min-h-[44px]"
        >
          -15s
        </button>
        <button
          onClick={skipRest}
          className="bg-accent-blue text-white px-5 py-2 rounded-lg text-sm font-medium min-h-[44px]"
        >
          דלג
        </button>
        <button
          onClick={() => addTime(15)}
          className="bg-white border border-light-border text-dark-text-muted px-3 py-2 rounded-lg text-sm hover:text-dark-text min-h-[44px]"
        >
          +15s
        </button>
      </div>
    </div>
  )
}

export default function LiveWorkout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const day = searchParams.get('day') || 'sunday'

  const {
    session, exercises, setExercises,
    currentExerciseIdx, setCurrentExerciseIdx,
    currentSetIdx, setCurrentSetIdx,
    restTimer, restActive,
    saving,
    skipRest, addTime,
    completeSet, startSession, completeSession,
  } = useWorkoutSession()

  const [loading, setLoading] = useState(true)
  const [weightInput, setWeightInput] = useState('')
  const [repsInput, setRepsInput] = useState('')
  const [initialRest, setInitialRest] = useState(90)
  const [showConfirm, setShowConfirm] = useState(false)
  const [completedKeys, setCompletedKeys] = useState({})

  // Init: start session & load exercises
  useEffect(() => {
    async function init() {
      try {
        const sess = await startSession(day)
        // Try to get plan exercises
        try {
          const { data: plan } = await workoutsAPI.getPlan()
          if (plan?.plan_data?.[day]?.exercises) {
            setExercises(plan.plan_data[day].exercises)
          } else {
            setExercises(demoExercises)
          }
        } catch {
          setExercises(demoExercises)
        }
        // Restore progress from session
        if (sess?.completed_sets) {
          setCompletedKeys(sess.completed_sets)
          setCurrentExerciseIdx(sess.current_exercise_index || 0)
          setCurrentSetIdx(sess.current_set_index || 0)
        }
      } catch {
        setExercises(demoExercises)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [day])

  // Sync weight/reps inputs with current exercise defaults
  useEffect(() => {
    const ex = exercises[currentExerciseIdx]
    if (ex) {
      setWeightInput(String(ex.weight_kg || ''))
      setRepsInput(String(ex.reps || ''))
    }
  }, [currentExerciseIdx, exercises])

  const currentExercise = exercises[currentExerciseIdx]
  const totalExercises = exercises.length

  const isSetCompleted = (exIdx, setIdx) => {
    const key = `${exIdx}_${setIdx}`
    return !!completedKeys[key]
  }

  const handleCompleteSet = async () => {
    if (!currentExercise) return
    const weight = parseFloat(weightInput) || 0
    const reps = parseInt(repsInput) || 0
    const rest = currentExercise.rest_seconds || 90
    setInitialRest(rest)

    const key = `${currentExerciseIdx}_${currentSetIdx}`
    setCompletedKeys(prev => ({ ...prev, [key]: { weight_kg: weight, reps, completed: true } }))

    if (session) {
      await completeSet(session.id, currentExerciseIdx, currentSetIdx, weight, reps, rest)
    }

    // Advance set index
    const nextSet = currentSetIdx + 1
    if (nextSet >= currentExercise.sets) {
      setCurrentSetIdx(0)
    } else {
      setCurrentSetIdx(nextSet)
    }
  }

  const handlePrevExercise = () => {
    if (currentExerciseIdx > 0) {
      setCurrentExerciseIdx(currentExerciseIdx - 1)
      setCurrentSetIdx(0)
    }
  }

  const handleNextExercise = () => {
    if (currentExerciseIdx < totalExercises - 1) {
      setCurrentExerciseIdx(currentExerciseIdx + 1)
      setCurrentSetIdx(0)
    }
  }

  const handleStop = async () => {
    if (session) {
      await completeSession(session.id)
    }
    navigate('/workouts')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-light-bg rounded-card">
        <div className="text-dark-text-muted text-lg">מתחיל אימון...</div>
      </div>
    )
  }

  if (!currentExercise) {
    return (
      <div className="text-center py-16 space-y-4 bg-light-bg rounded-card" dir="rtl">
        <div className="text-5xl">🏆</div>
        <p className="text-xl font-bold text-dark-text">האימון הושלם!</p>
        <button onClick={() => navigate('/workouts')} className="bg-accent-blue text-white px-6 py-3 rounded-lg font-semibold shadow-sm">
          חזור לתכנית
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-8 bg-light-bg p-6 rounded-card" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-dark-text">🏋️ אימון חי</h1>
          <p className="text-xs text-dark-text-muted">
            תרגיל {currentExerciseIdx + 1} מתוך {totalExercises}
          </p>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          className="bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-lg text-sm hover:bg-red-100 transition-colors min-h-[44px]"
        >
          עצור אימון
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-accent-blue h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentExerciseIdx) / totalExercises) * 100}%` }}
        />
      </div>

      {/* Exercise card */}
      <div className="bg-white border border-light-border rounded-card p-6 space-y-5 shadow-sm">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-dark-text">{currentExercise.name}</h2>
          <p className="text-dark-text-muted mt-1">{currentExercise.muscle_group}</p>
        </div>

        {/* Sets grid */}
        <div className="flex gap-2 justify-center flex-wrap">
          {Array.from({ length: currentExercise.sets }).map((_, i) => {
            const done = isSetCompleted(currentExerciseIdx, i)
            const isCurrent = i === currentSetIdx && !done
            return (
              <div
                key={i}
                onClick={() => { if (!done) setCurrentSetIdx(i) }}
                className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center cursor-pointer border-2 transition-all ${
                  done
                    ? 'bg-green-50 border-green-500 text-green-600'
                    : isCurrent
                    ? 'bg-blue-50 border-accent-blue text-accent-blue'
                    : 'bg-white border-light-border text-dark-text-muted'
                }`}
              >
                <span className="text-xs text-current opacity-70">סט</span>
                <span className="font-bold">{done ? '✅' : i + 1}</span>
              </div>
            )
          })}
        </div>

        {/* Inputs */}
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-dark-text-muted">משקל (ק״ג)</label>
            <input
              type="number"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              className="w-full bg-white border border-light-border rounded-lg px-3 py-3 text-dark-text text-center text-lg font-bold min-h-[48px]"
              placeholder="0"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-dark-text-muted">חזרות</label>
            <input
              type="number"
              value={repsInput}
              onChange={e => setRepsInput(e.target.value)}
              className="w-full bg-white border border-light-border rounded-lg px-3 py-3 text-dark-text text-center text-lg font-bold min-h-[48px]"
              placeholder="0"
            />
          </div>
        </div>

        {/* Complete set button */}
        <button
          onClick={handleCompleteSet}
          disabled={saving}
          className="w-full bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg transition-colors min-h-[56px] shadow-sm"
        >
          {saving ? 'שומר...' : `סמן סט ${currentSetIdx + 1} כבוצע ✓`}
        </button>

        {saving && (
          <p className="text-center text-xs text-dark-text-muted">שומר...</p>
        )}
      </div>

      {/* Rest timer */}
      <RestTimer
        restTimer={restTimer}
        restActive={restActive}
        initialRest={initialRest}
        skipRest={skipRest}
        addTime={addTime}
      />

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={handlePrevExercise}
          disabled={currentExerciseIdx === 0}
          className="flex-1 bg-white border border-light-border text-dark-text-muted py-3 rounded-xl font-medium disabled:opacity-30 hover:text-dark-text transition-colors min-h-[48px]"
        >
          ← תרגיל קודם
        </button>
        <button
          onClick={handleNextExercise}
          disabled={currentExerciseIdx >= totalExercises - 1}
          className="flex-1 bg-white border border-light-border text-dark-text-muted py-3 rounded-xl font-medium disabled:opacity-30 hover:text-dark-text transition-colors min-h-[48px]"
        >
          תרגיל הבא →
        </button>
      </div>

      {/* Confirm stop dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-sm space-y-4 shadow-lg" dir="rtl">
            <h3 className="text-lg font-bold text-dark-text">לסיים את האימון?</h3>
            <p className="text-dark-text-muted text-sm">ההתקדמות תישמר</p>
            <div className="flex gap-3">
              <button
                onClick={handleStop}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium"
              >
                סיים אימון
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-white border border-light-border text-dark-text-muted py-3 rounded-lg font-medium hover:text-dark-text"
              >
                המשך אימון
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
