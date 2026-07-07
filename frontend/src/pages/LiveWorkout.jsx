import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkoutSession } from '../hooks/useWorkoutSession'
import { workoutsAPI } from '../services/api'
import { Check, Trophy, Dumbbell, Loader2, ChevronRight, ChevronLeft } from 'lucide-react'

const demoExercises = [
  { name: "לחיצת חזה", muscle_group: "חזה", sets: 4, reps: 10, weight_kg: 60, rest_seconds: 90 },
  { name: "מתח רחב", muscle_group: "גב", sets: 3, reps: 8, weight_kg: 0, rest_seconds: 120 },
  { name: "לחיצת כתפיים", muscle_group: "כתפיים", sets: 3, reps: 12, weight_kg: 30, rest_seconds: 90 },
  { name: "כפיפות מרפקים", muscle_group: "ביצפס", sets: 3, reps: 12, weight_kg: 15, rest_seconds: 60 },
  { name: "סקוואט", muscle_group: "רגליים", sets: 4, reps: 10, weight_kg: 80, rest_seconds: 120 },
]

function ExerciseStepper({ exercises, currentExerciseIdx, completedKeys, onJump }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {exercises.map((ex, i) => {
        const allSetsDone = Array.from({ length: ex.sets }).every((_, si) => completedKeys[`${i}_${si}`])
        const isCurrent = i === currentExerciseIdx
        const state = allSetsDone ? 'done' : isCurrent ? 'current' : 'future'
        return (
          <button
            key={i}
            onClick={() => onJump(i)}
            className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-xl border-2 transition-all text-center ${
              state === 'done'
                ? 'bg-volt-soft border-volt/40 text-volt'
                : state === 'current'
                ? 'bg-volt border-volt text-ink shadow-[0_4px_18px_rgba(163,230,53,0.3)]'
                : 'bg-white/4 border-transparent text-text-mid hover:bg-white/8'
            }`}
          >
            <span className="text-xs font-bold tabular-nums">{state === 'done' ? <Check className="w-3.5 h-3.5" /> : i + 1}</span>
            <span className="text-[10px] leading-tight truncate max-w-[56px]">{ex.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function RestTimer({ restTimer, restActive, initialRest, skipRest, addTime }) {
  const circumference = 2 * Math.PI * 70
  const progress = initialRest > 0 ? restTimer / initialRest : 0

  if (!restActive && restTimer === 0) return null

  return (
    <div className="card-glass p-6 text-center space-y-4 anim-rise">
      <p className="text-text-mid text-sm font-medium">זמן מנוחה</p>

      <div className="relative w-40 h-40 mx-auto">
        <svg className="w-40 h-40 -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
          <circle
            cx="80" cy="80" r="70" fill="none" stroke="#22D3EE" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-extrabold text-text-hi tabular-nums" dir="ltr">
            {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
          </span>
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <button
          onClick={() => addTime(-15)}
          className="bg-white/4 border border-line text-text-mid px-3 py-2 rounded-elem text-sm hover:text-text-hi hover:bg-white/8 transition min-h-[44px] tabular-nums"
          dir="ltr"
        >
          -15s
        </button>
        <button
          onClick={skipRest}
          className="bg-cyan text-ink px-5 py-2 rounded-elem text-sm font-bold min-h-[44px] hover:brightness-105 active:scale-95 transition"
        >
          דלג
        </button>
        <button
          onClick={() => addTime(15)}
          className="bg-white/4 border border-line text-text-mid px-3 py-2 rounded-elem text-sm hover:text-text-hi hover:bg-white/8 transition min-h-[44px] tabular-nums"
          dir="ltr"
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

  const handleJumpToExercise = (idx) => {
    const ex = exercises[idx]
    if (!ex) return
    let nextSet = ex.sets - 1
    for (let si = 0; si < ex.sets; si++) {
      if (!completedKeys[`${idx}_${si}`]) { nextSet = si; break }
    }
    setCurrentExerciseIdx(idx)
    setCurrentSetIdx(nextSet)
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
      <div className="flex items-center justify-center gap-2 h-64 card-glass">
        <Loader2 className="w-5 h-5 animate-spin text-volt" />
        <div className="text-text-mid text-lg">מתחיל אימון...</div>
      </div>
    )
  }

  if (!currentExercise) {
    return (
      <div className="text-center py-16 space-y-4 card-glass anim-rise" dir="rtl">
        <div className="flex justify-center">
          <span className="w-16 h-16 rounded-full bg-amber-soft text-amber flex items-center justify-center anim-pop">
            <Trophy className="w-8 h-8" />
          </span>
        </div>
        <p className="text-xl font-extrabold text-text-hi">האימון הושלם!</p>
        <button onClick={() => navigate('/workouts')} className="btn-volt px-6 py-3 text-sm">
          חזור לתכנית
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between anim-rise">
        <div>
          <h1 className="text-lg font-extrabold text-text-hi flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-volt" /> אימון חי
          </h1>
          <span className="inline-flex items-center gap-1 bg-volt-soft text-volt text-xs font-semibold px-2 py-0.5 rounded-full mt-1">
            <span className="opacity-70">תרגיל</span> <span dir="ltr" className="tabular-nums">{currentExerciseIdx + 1}/{totalExercises}</span>
          </span>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          className="bg-coral-soft text-coral border border-coral/30 px-3 py-2 rounded-elem text-sm hover:bg-coral/20 transition-colors min-h-[44px]"
        >
          עצור אימון
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/8 rounded-full h-2">
        <div
          className="bg-volt h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentExerciseIdx) / totalExercises) * 100}%` }}
        />
      </div>

      {/* Exercise stepper — preview of all exercises in this workout */}
      <ExerciseStepper
        exercises={exercises}
        currentExerciseIdx={currentExerciseIdx}
        completedKeys={completedKeys}
        onJump={handleJumpToExercise}
      />

      {/* Exercise card */}
      <div className="card-glass p-6 space-y-5 anim-rise anim-d1">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-text-hi">{currentExercise.name}</h2>
          <span className="inline-flex items-center gap-1 bg-violet-soft text-violet text-xs font-semibold px-2 py-0.5 rounded-full mt-2">
            <span className="opacity-70">סט</span> <span dir="ltr" className="tabular-nums">{currentSetIdx + 1}/{currentExercise.sets}</span>
          </span>
        </div>

        {/* Sets table */}
        <div className="space-y-2">
          <div className="grid grid-cols-4 text-center text-xs text-text-mid px-2">
            <span>סט</span>
            <span>משקל</span>
            <span>חזרות</span>
            <span>בוצע</span>
          </div>
          {Array.from({ length: currentExercise.sets }).map((_, i) => {
            const done = isSetCompleted(currentExerciseIdx, i)
            const isCurrent = i === currentSetIdx && !done
            const completedData = completedKeys[`${currentExerciseIdx}_${i}`]
            return (
              <div
                key={i}
                onClick={() => { if (!done) setCurrentSetIdx(i) }}
                className={`grid grid-cols-4 items-center rounded-xl border-2 py-2 px-2 cursor-pointer transition-all ${
                  done
                    ? 'bg-volt-soft border-volt/25'
                    : isCurrent
                    ? 'bg-white/4 border-volt'
                    : 'bg-white/4 border-transparent'
                }`}
              >
                <span className={`text-center font-medium tabular-nums ${isCurrent ? 'text-volt' : 'text-text-mid'}`}>{i + 1}</span>
                {isCurrent ? (
                  <input
                    type="number"
                    value={weightInput}
                    onChange={e => setWeightInput(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="w-16 mx-auto bg-white/6 border border-line-strong rounded-elem px-2 py-1 text-text-hi text-center font-bold focus:outline-none focus:border-volt/60"
                  />
                ) : (
                  <span className="text-center font-bold text-text-hi tabular-nums" dir="ltr">{done ? `${completedData.weight_kg}kg` : '-'}</span>
                )}
                {isCurrent ? (
                  <input
                    type="number"
                    value={repsInput}
                    onChange={e => setRepsInput(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="w-16 mx-auto bg-white/6 border border-line-strong rounded-elem px-2 py-1 text-text-hi text-center font-bold focus:outline-none focus:border-volt/60"
                  />
                ) : (
                  <span className="text-center font-bold text-text-hi tabular-nums" dir="ltr">{done ? completedData.reps : '-'}</span>
                )}
                <span className="flex justify-center">
                  {done ? (
                    <span key="done" className="w-6 h-6 rounded-full flex items-center justify-center bg-volt text-ink anim-pop">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="w-6 h-6 rounded-full border-2 border-line-strong" />
                  )}
                </span>
              </div>
            )
          })}
        </div>

        {/* Complete set button */}
        <button
          onClick={handleCompleteSet}
          disabled={saving}
          className="btn-volt w-full py-4 text-lg min-h-[56px] flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-5 h-5 animate-spin" />}
          {saving ? 'שומר...' : 'השלם תרגיל'}
        </button>

        {saving && (
          <p className="text-center text-xs text-text-mid">שומר...</p>
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
          className="flex-1 bg-white/4 border border-line text-text-mid py-3 rounded-xl font-medium disabled:opacity-30 hover:text-text-hi hover:bg-white/8 transition-colors min-h-[48px] flex items-center justify-center gap-1.5"
        >
          <ChevronRight className="w-4 h-4" /> תרגיל קודם
        </button>
        <button
          onClick={handleNextExercise}
          disabled={currentExerciseIdx >= totalExercises - 1}
          className="flex-1 bg-white/4 border border-line text-text-mid py-3 rounded-xl font-medium disabled:opacity-30 hover:text-text-hi hover:bg-white/8 transition-colors min-h-[48px] flex items-center justify-center gap-1.5"
        >
          תרגיל הבא <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Confirm stop dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-2 border border-line-strong rounded-card p-6 w-full max-w-sm space-y-4 shadow-2xl anim-rise" dir="rtl">
            <h3 className="text-lg font-bold text-text-hi">לסיים את האימון?</h3>
            <p className="text-text-mid text-sm">ההתקדמות תישמר</p>
            <div className="flex gap-3">
              <button
                onClick={handleStop}
                className="flex-1 bg-coral hover:brightness-105 text-ink py-3 rounded-elem font-bold active:scale-95 transition"
              >
                סיים אימון
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-white/4 border border-line text-text-mid py-3 rounded-elem font-medium hover:text-text-hi hover:bg-white/8 transition"
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
