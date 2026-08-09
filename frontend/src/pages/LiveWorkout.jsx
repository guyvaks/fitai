import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkoutSession } from '../hooks/useWorkoutSession'
import { workoutsAPI } from '../services/api'
import api from '../services/api'
import ExerciseSearch from '../components/ExerciseSearch'
import { MUSCLE_GROUP_LABELS } from '../utils/exerciseMeta'
import ExerciseMediaModal from '../components/ExerciseMediaModal'
import { useExerciseMasterMedia } from '../hooks/useExerciseMasterMedia'
import spotifyIconGreen from '../assets/spotify-icon-green.svg'
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer'
import { startAuth, isConnected, disconnect as disconnectSpotify } from '../services/spotifyAuth'
import {
  Check, Trophy, Dumbbell, Loader2, ChevronRight, ChevronLeft,
  Clock, StickyNote, Plus, X, Search, Type, Settings,
  Music, Play, Pause, SkipBack, SkipForward, Unlink, Info,
} from 'lucide-react'

const FREE_MUSCLE_GROUPS = Object.values(MUSCLE_GROUP_LABELS)

// Manually-built plans store `sets` as an array of per-set {weight_kg, reps}
// targets; AI-generated plans still store a flat `sets: <count>` with one
// target applied to every set. Normalize to the flat shape LiveWorkout already
// renders against, keeping per-set targets on the side for the input defaults.
function normalizeExercises(exercises) {
  return exercises.map(ex => {
    if (Array.isArray(ex.sets)) {
      return { ...ex, sets: ex.sets.length, _setTargets: ex.sets }
    }
    return ex
  })
}

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

// Sticky bottom control bar while rest is active — matches the Hevy-style
// inspiration (-15s / timer / +15s / skip in one row at the bottom of the screen).
function RestTimerBar({ restTimer, restActive, initialRest, skipRest, addTime }) {
  if (!restActive && restTimer === 0) return null

  const progress = initialRest > 0 ? restTimer / initialRest : 0

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-surface-2/95 backdrop-blur-xl border-t border-line-strong anim-rise">
      <div className="max-w-lg mx-auto" dir="rtl">
        <div className="h-1.5 bg-white/10 overflow-hidden">
          <div
            className="h-full bg-volt origin-left"
            style={{ width: '100%', transform: `scaleX(${progress})`, transition: 'transform 1s linear' }}
          />
        </div>

        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => addTime(-15)}
            className="bg-white/6 border border-line text-text-mid px-3.5 py-2.5 rounded-[var(--radius-pill)] text-sm hover:text-text-hi hover:bg-white/10 transition min-h-[48px] tabular-nums shrink-0"
            dir="ltr"
          >
            -15s
          </button>

          <span className="text-3xl font-extrabold text-text-hi tabular-nums flex-1 text-center" dir="ltr">
            {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
          </span>

          <button
            onClick={() => addTime(15)}
            className="bg-white/6 border border-line text-text-mid px-3.5 py-2.5 rounded-[var(--radius-pill)] text-sm hover:text-text-hi hover:bg-white/10 transition min-h-[48px] tabular-nums shrink-0"
            dir="ltr"
          >
            +15s
          </button>
          <button
            onClick={skipRest}
            className="bg-cyan text-ink px-4 py-2.5 rounded-[var(--radius-pill)] text-sm font-bold min-h-[48px] hover:brightness-105 active:scale-95 transition shrink-0"
          >
            דלג
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}min ${s}s`
}

// In-workout Spotify playback -- personal-use/small-testing feature only
// (Spotify Development Mode caps this at 5 authorized users, see DESIGN.md
// §8). Not part of the visual redesign; lives here because LiveWorkout is
// the only screen with a persistent in-progress session to attach it to.
function MusicWidget() {
  const [connected, setConnected] = useState(isConnected())
  const { ready, track, isPaused, error, togglePlay, nextTrack, previousTrack } = useSpotifyPlayer()

  if (!connected) {
    return (
      // Spotify's own brand colors/mark, not FitAI's theme tokens -- their
      // guidelines require the green mark to sit only on a black or white
      // field (developer.spotify.com/documentation/design), so this button
      // stays black-on-white-text in both FitAI light and dark mode rather
      // than following card-glass/theme tokens like the rest of the screen.
      // Icon is the official downloaded asset (Primary_Logo_Green_RGB.svg,
      // fill #1ed760 -- matches developer.spotify.com's own listed palette),
      // not a redrawn approximation. No official prebuilt "Connect with
      // Spotify" button template exists, so padding/radius/wording below are
      // our own choices within their exclusion-zone and color rules, not a
      // copied spec.
      <button
        onClick={() => startAuth().catch(() => {})}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-[var(--radius-pill)] bg-[#121212] text-white text-sm font-bold hover:bg-[#282828] active:scale-[0.98] transition"
        style={{ minHeight: 48 }}
      >
        <img src={spotifyIconGreen} alt="" className="w-6 h-6 shrink-0" />
        התחבר עם Spotify
      </button>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-elem border border-coral/30 bg-coral-soft text-coral text-xs">
        <span className="flex items-center gap-1.5 min-w-0"><Music className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{error}</span></span>
        <button
          onClick={() => { disconnectSpotify(); setConnected(false) }}
          className="shrink-0 hover:text-coral/70 transition"
          aria-label="נתק Spotify"
        >
          <Unlink className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="card-glass px-3 py-2 flex items-center gap-2 anim-rise">
      <span className="w-9 h-9 rounded-lg bg-volt-soft text-volt flex items-center justify-center shrink-0 overflow-hidden">
        {track?.image ? <img src={track.image} alt="" className="w-full h-full object-cover" /> : <Music className="w-4 h-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-text-hi text-xs font-bold truncate">
          {track?.name || (ready ? 'בחר שיר מתוך אפליקציית Spotify' : 'מתחבר...')}
        </p>
        {track?.artists && <p className="text-text-mid text-[11px] truncate">{track.artists}</p>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={previousTrack} className="p-1.5 text-text-mid hover:text-text-hi transition" aria-label="הקודם">
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={togglePlay}
          className="p-2 rounded-full bg-volt text-ink hover:brightness-105 active:scale-95 transition"
          aria-label={isPaused ? 'נגן' : 'השהה'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5" fill="currentColor" /> : <Pause className="w-3.5 h-3.5" fill="currentColor" />}
        </button>
        <button onClick={nextTrack} className="p-1.5 text-text-mid hover:text-text-hi transition" aria-label="הבא">
          <SkipForward className="w-4 h-4" />
        </button>
        <button
          onClick={() => { disconnectSpotify(); setConnected(false) }}
          className="p-1.5 text-text-low hover:text-coral transition"
          aria-label="נתק Spotify"
        >
          <Unlink className="w-3.5 h-3.5" />
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
    completeSet, uncompleteSet, startSession, completeSession,
  } = useWorkoutSession()

  const [loading, setLoading] = useState(true)
  // Per-row draft weight/reps/failure-flag, keyed by `${exerciseIdx}_${setIdx}`
  // -- replaces the old single weightInput/repsInput bound only to "the
  // current set". Every not-yet-completed row is independently editable now
  // (Hevy-style), not just one active row at a time.
  const [setDrafts, setSetDrafts] = useState({})
  const [initialRest, setInitialRest] = useState(90)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [completedKeys, setCompletedKeys] = useState({})
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [notes, setNotes] = useState({}) // { [exerciseIdx]: string } — session-local only
  const [previousSets, setPreviousSets] = useState([]) // [{set_number, weight_kg, reps}] for currentExercise.name, most recent other session
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [addExerciseMode, setAddExerciseMode] = useState('search')
  const [freeExName, setFreeExName] = useState('')
  const [freeExMuscleGroup, setFreeExMuscleGroup] = useState(FREE_MUSCLE_GROUPS[0])
  const [showAnimation, setShowAnimation] = useState(false)
  const [showRirInfo, setShowRirInfo] = useState(false)
  const { byNameHe: exerciseMediaByName } = useExerciseMasterMedia()
  const [showSettings, setShowSettings] = useState(false)
  const [restTimerOverride, setRestTimerOverride] = useState('') // seconds, empty = use plan default
  const [autoStartRest, setAutoStartRest] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  // Load saved workout preferences (rest timer override / auto-start), if any
  useEffect(() => {
    api.get('/api/v1/users/profile')
      .then(({ data }) => {
        const prefs = data?.workout_preferences
        if (prefs?.rest_timer_seconds != null) setRestTimerOverride(String(prefs.rest_timer_seconds))
        if (prefs?.auto_start_rest === false) setAutoStartRest(false)
      })
      .catch(() => {}) // no saved profile yet -- defaults are fine
  }, [])

  // Init: start session & load exercises
  useEffect(() => {
    async function init() {
      try {
        const sess = await startSession(day)
        // Try to get plan exercises
        try {
          const { data: plan } = await workoutsAPI.getPlan()
          // A day added/edited via the manual builder is stored as a flat
          // top-level key and can coexist with an older AI-approved plan's
          // `workout_plan` wrapper for the same day (manual-merge behavior in
          // POST /workouts/plan/manual) — the flat, manually-edited version
          // must win over the wrapped one.
          const dayPlan = plan?.plan_data?.[day] ?? plan?.plan_data?.workout_plan?.[day]
          if (dayPlan?.exercises) {
            setExercises(normalizeExercises(dayPlan.exercises))
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

  // Elapsed workout duration, counting up from session start
  useEffect(() => {
    if (!session?.started_at) return
    const startedAt = new Date(session.started_at).getTime()
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [session?.started_at])

  // "Previous" reference -- per-set breakdown of the most recent other
  // session that logged this exercise, e.g. set 2 shows what set 2 was
  // last time (not one repeated aggregate value across every row).
  useEffect(() => {
    const ex = exercises[currentExerciseIdx]
    if (!ex) return
    let cancelled = false
    setPreviousSets([])
    workoutsAPI.getExerciseHistory(ex.name)
      .then(({ data }) => { if (!cancelled) setPreviousSets(data?.sets || []) })
      .catch(() => { if (!cancelled) setPreviousSets([]) })
    return () => { cancelled = true }
  }, [currentExerciseIdx, exercises])

  const currentExercise = exercises[currentExerciseIdx]
  const totalExercises = exercises.length
  // Match by exact canonical_name_he -- reliable for AI-generated plans
  // (constrained to exercises_master), absent (no thumbnail shown, by
  // design) for manually-typed/free-text exercise names that don't match.
  const currentExerciseMedia = currentExercise ? exerciseMediaByName.get(currentExercise.name) : null

  const isSetCompleted = (exIdx, setIdx) => {
    const key = `${exIdx}_${setIdx}`
    return !!completedKeys[key]
  }

  // Default draft values for a not-yet-touched row: prefer last session's
  // same-set-number weight/reps (previousSets), then this plan's per-set
  // target, then the exercise's flat default.
  const getSetDraft = (exIdx, setIdx, ex) => {
    const key = `${exIdx}_${setIdx}`
    if (setDrafts[key]) return setDrafts[key]
    const prev = previousSets.find(s => s.set_number === setIdx + 1)
    const target = ex._setTargets?.[setIdx]
    const weight = prev?.weight_kg ?? target?.weight_kg ?? ex.weight_kg ?? 0
    const reps = prev?.reps ?? target?.reps ?? ex.reps ?? 0
    const rir = prev?.rir
    return { weight: weight ? String(weight) : '', reps: reps ? String(reps) : '', rir: rir != null ? String(rir) : '', failure: false }
  }

  const updateSetDraft = (exIdx, setIdx, ex, patch) => {
    const key = `${exIdx}_${setIdx}`
    setSetDrafts(prev => ({ ...prev, [key]: { ...getSetDraft(exIdx, setIdx, ex), ...patch } }))
  }

  const handleToggleFailureDraft = (exIdx, setIdx, ex) => {
    const draft = getSetDraft(exIdx, setIdx, ex)
    updateSetDraft(exIdx, setIdx, ex, { failure: !draft.failure })
  }

  // Checkmark toggle per row -- completes (using that row's own draft
  // values) or undoes that specific set, independent of every other row.
  // Replaces the old single-active-row wizard (one global input + one
  // "השלם תרגיל" button advancing a currentSetIdx pointer).
  const handleToggleSet = async (setIdx) => {
    if (!currentExercise) return
    const done = isSetCompleted(currentExerciseIdx, setIdx)
    const key = `${currentExerciseIdx}_${setIdx}`

    if (done) {
      setCompletedKeys(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      if (session) {
        await uncompleteSet(session.id, currentExerciseIdx, setIdx, currentExercise.name)
      }
      return
    }

    const draft = getSetDraft(currentExerciseIdx, setIdx, currentExercise)
    const weight = parseFloat(draft.weight) || 0
    const reps = parseInt(draft.reps) || 0
    if (weight < 0 || reps < 0) return
    const rir = draft.rir !== '' && draft.rir != null ? parseInt(draft.rir) : null
    const restOverride = parseInt(restTimerOverride)
    const rest = Number.isFinite(restOverride) && restOverride > 0 ? restOverride : (currentExercise.rest_seconds || 90)
    setInitialRest(rest)
    const setType = draft.failure ? 'failure' : 'normal'

    setCompletedKeys(prev => ({ ...prev, [key]: { weight_kg: weight, reps, rir, completed: true, set_type: setType } }))

    if (session) {
      await completeSet(session.id, currentExerciseIdx, setIdx, weight, reps, rest, currentExercise.name, setType, autoStartRest, rir)
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

  const handleDiscard = async () => {
    if (session) {
      await workoutsAPI.abandonSession(session.id)
    }
    navigate('/workouts')
  }

  // Add an extra set to the current exercise, session-local only (does not
  // touch the saved plan) — carries forward the last set's target as a
  // sensible default for the new one.
  const handleAddSet = () => {
    if (!currentExercise) return
    setExercises(prev => prev.map((ex, i) => {
      if (i !== currentExerciseIdx) return ex
      const lastTarget = ex._setTargets?.[ex.sets - 1] || { weight_kg: ex.weight_kg, reps: ex.reps }
      const nextTargets = ex._setTargets ? [...ex._setTargets, lastTarget] : undefined
      return { ...ex, sets: ex.sets + 1, ...(nextTargets ? { _setTargets: nextTargets } : {}) }
    }))
  }

  // Add an ad-hoc exercise to this session's exercise list only (not saved to the plan)
  const addExerciseToSession = (exercise) => {
    setExercises(prev => [...prev, {
      name: exercise.name,
      muscle_group: exercise.muscle_group || '',
      sets: 3,
      reps: 10,
      weight_kg: 0,
      rest_seconds: 90,
    }])
    setShowAddExercise(false)
    setFreeExName('')
  }

  const handleAddExerciseFree = () => {
    if (!freeExName.trim()) return
    addExerciseToSession({ name: freeExName.trim(), muscle_group: freeExMuscleGroup })
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const seconds = parseInt(restTimerOverride)
      await api.put('/api/v1/users/profile', {
        workout_preferences: {
          rest_timer_seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
          auto_start_rest: autoStartRest,
        },
      })
      setShowSettings(false)
    } finally {
      setSavingSettings(false)
    }
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
    <div className={`space-y-4 max-w-lg mx-auto ${restActive || restTimer > 0 ? 'pb-24' : 'pb-8'}`} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between anim-rise flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-extrabold text-text-hi flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-volt" /> אימון חי
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 bg-volt-soft text-volt text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="opacity-70">תרגיל</span> <span dir="ltr" className="tabular-nums">{currentExerciseIdx + 1}/{totalExercises}</span>
            </span>
            <span className="inline-flex items-center gap-1 bg-white/6 text-text-mid text-xs font-medium px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" /> <span dir="ltr" className="tabular-nums">{formatDuration(elapsedSeconds)}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            aria-label="הגדרות אימון"
            className="bg-white/4 border border-line text-text-mid p-2 rounded-elem hover:text-text-hi hover:bg-white/8 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={() => setShowDiscardConfirm(true)}
            className="bg-white/4 border border-line text-text-mid px-3 py-2 rounded-elem text-sm hover:text-coral hover:border-coral/30 transition-colors min-h-[44px]"
          >
            בטל אימון
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            className="bg-coral-soft text-coral border border-coral/30 px-3 py-2 rounded-elem text-sm hover:bg-coral/20 transition-colors min-h-[44px]"
          >
            סיים אימון
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/8 rounded-full h-2">
        <div
          className="bg-volt h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentExerciseIdx) / totalExercises) * 100}%` }}
        />
      </div>

      {/* In-workout music — personal-use feature, see DESIGN.md §8 */}
      <MusicWidget />

      {/* Exercise stepper — preview of all exercises in this workout */}
      <ExerciseStepper
        exercises={exercises}
        currentExerciseIdx={currentExerciseIdx}
        completedKeys={completedKeys}
        onJump={handleJumpToExercise}
      />

      {/* Exercise card */}
      <div className="card-glass p-6 space-y-5 anim-rise anim-d1">
        <div className="flex items-center gap-2.5">
          {currentExerciseMedia && (
            <button
              type="button"
              onClick={() => setShowAnimation(true)}
              className="shrink-0 rounded-lg overflow-hidden w-9 h-9 border border-volt/40 hover:border-volt transition"
              aria-label="הצג הדגמת תרגיל"
            >
              <img
                src={currentExerciseMedia.thumbnail_png_url}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
          )}
          <h2 className="text-xl font-extrabold text-text-hi truncate flex-1 min-w-0">{currentExercise.name}</h2>
          <span className="shrink-0 inline-flex items-center gap-1 bg-violet-soft text-violet text-xs font-semibold px-2 py-0.5 rounded-full">
            <span className="opacity-70">סט</span> <span dir="ltr" className="tabular-nums">{currentSetIdx + 1}/{currentExercise.sets}</span>
          </span>
        </div>

        {/* Notes — optional, session-local */}
        <div className="relative">
          <StickyNote className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-mid" />
          <input
            type="text"
            placeholder="הוסף הערות..."
            value={notes[currentExerciseIdx] || ''}
            onChange={e => setNotes(prev => ({ ...prev, [currentExerciseIdx]: e.target.value }))}
            className="w-full bg-white/6 border border-line-strong rounded-elem pr-9 pl-3 py-2 text-text-hi text-sm focus:outline-none focus:border-volt/60"
          />
        </div>

        {/* Sets table -- each not-yet-done row has its own always-editable
            weight/reps inputs (no single "current" row concept anymore) and
            its own checkmark (complete/undo) + F (failure) toggle, matching
            the Hevy-style reference instead of the old single-active-row
            wizard + one "השלם תרגיל" button. */}
        <div className="space-y-2">
          {/* Unequal columns -- סט/✓ only ever hold a 1-2 digit number or a
              small badge, so ק"ג/חזרות get more of the row's width (a
              realistic 3-digit decimal like 999.9 needs it, same min-w-0
              fix as eebc011). קודם is read-only reference data, free to
              truncate. Last column widened vs the old 2rem to fit both the
              checkmark and the F toggle side by side on not-done rows. */}
          <div className="grid grid-cols-[1.6rem_1fr_1fr_1fr_2.6rem] gap-1 text-center text-xs text-text-mid px-2">
            <span>סט</span>
            <span>קודם</span>
            <span>ק"ג</span>
            <span className="relative flex items-center justify-center gap-0.5">
              חזרות
              <button
                type="button"
                onClick={() => setShowRirInfo(v => !v)}
                className="shrink-0 text-text-mid hover:text-volt transition"
                aria-label="הסבר על RIR"
              >
                <Info className="w-3 h-3" />
              </button>
              {showRirInfo && (
                <>
                  {/* Full-screen transparent backdrop -- tap anywhere outside
                      the popover to dismiss it (tap-based, not hover, so it
                      works on touch devices). */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowRirInfo(false)} />
                  <div
                    className="absolute top-full mt-2 right-1/2 translate-x-1/2 z-50 w-56 bg-surface-2 border border-line-strong rounded-elem shadow-2xl p-3 text-right"
                    dir="rtl"
                  >
                    <p className="text-xs font-normal text-text-hi leading-relaxed normal-case">
                      <span className="font-bold text-volt">RIR (חזרות בקופה)</span> — כמה חזרות נוספות היית יכול לעשות באותו סט לפני כשל מוחלט. למשל: 10 חזרות עם RIR 2 = יכולת לעשות עוד כ-2 חזרות.
                    </p>
                  </div>
                </>
              )}
            </span>
            <span>✓</span>
          </div>
          {(() => {
            const firstIncompleteIdx = Array.from({ length: currentExercise.sets })
              .findIndex((_, i) => !isSetCompleted(currentExerciseIdx, i))
            return Array.from({ length: currentExercise.sets }).map((_, i) => {
              const done = isSetCompleted(currentExerciseIdx, i)
              const isNext = i === firstIncompleteIdx
              const completedData = completedKeys[`${currentExerciseIdx}_${i}`]
              const draft = getSetDraft(currentExerciseIdx, i, currentExercise)
              const prevForSet = previousSets.find(s => s.set_number === i + 1)
              return (
                <div
                  key={i}
                  className={`grid grid-cols-[1.6rem_1fr_1fr_1fr_2.6rem] gap-1 items-center rounded-xl border-2 py-2 px-2 transition-all ${
                    done
                      ? 'bg-volt-soft border-volt/25'
                      : isNext
                      ? 'bg-white/4 border-volt'
                      : 'bg-white/4 border-transparent'
                  }`}
                >
                  <span className={`min-w-0 text-center font-medium tabular-nums ${isNext ? 'text-volt' : 'text-text-mid'}`}>{i + 1}</span>
                  <span className="min-w-0 truncate text-center text-text-low text-xs tabular-nums" dir="ltr">
                    {prevForSet
                      ? `${prevForSet.weight_kg}kg x ${prevForSet.reps}${prevForSet.rir != null ? ` @ ${prevForSet.rir}` : ''}`
                      : '—'}
                  </span>
                  {done ? (
                    <span className="min-w-0 truncate text-center font-bold text-text-hi tabular-nums" dir="ltr">{completedData.weight_kg}kg</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={draft.weight}
                      onChange={e => updateSetDraft(currentExerciseIdx, i, currentExercise, { weight: e.target.value })}
                      className="w-full min-w-0 bg-white/6 border border-line-strong rounded-elem px-1 py-1 text-text-hi text-center text-sm font-bold focus:outline-none focus:border-volt/60"
                    />
                  )}
                  {done ? (
                    <span className="min-w-0 truncate text-center font-bold text-text-hi tabular-nums" dir="ltr">
                      {completedData.reps}{completedData.rir != null ? <span className="text-text-mid font-normal"> @ {completedData.rir}</span> : null}
                    </span>
                  ) : (
                    // RIR folded into the same cell as REPS ("10 @ 2") rather
                    // than a 6th always-visible column -- the row is already
                    // tight on a 430px frame with 5 columns.
                    <div className="flex items-center gap-0.5 min-w-0" dir="ltr">
                      <input
                        type="number"
                        min="0"
                        value={draft.reps}
                        onChange={e => updateSetDraft(currentExerciseIdx, i, currentExercise, { reps: e.target.value })}
                        className="w-0 flex-1 min-w-0 bg-white/6 border border-line-strong rounded-elem px-1 py-1 text-text-hi text-center text-sm font-bold focus:outline-none focus:border-volt/60"
                        title="חזרות"
                      />
                      <span className="text-text-mid text-xs shrink-0">@</span>
                      <input
                        type="number"
                        min="0"
                        value={draft.rir}
                        onChange={e => updateSetDraft(currentExerciseIdx, i, currentExercise, { rir: e.target.value })}
                        placeholder="RIR"
                        className="w-10 shrink-0 min-w-0 bg-violet-soft border border-violet/40 rounded-elem px-0.5 py-1 text-violet text-center text-xs font-bold placeholder:text-violet/70 focus:outline-none focus:border-violet"
                        title="חזרות בכיס (RIR) — כמה חזרות נוספות היית יכול לעשות"
                      />
                    </div>
                  )}
                  <span className="min-w-0 flex items-center justify-center gap-1">
                    {done ? (
                      completedData.set_type === 'failure' ? (
                        <button
                          type="button"
                          onClick={() => handleToggleSet(i)}
                          className="w-6 h-6 rounded-full flex items-center justify-center bg-orange text-ink text-[10px] font-extrabold anim-pop"
                          title="כשל — לחץ לביטול"
                        >
                          F
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleSet(i)}
                          className="w-6 h-6 rounded-full flex items-center justify-center bg-volt text-ink anim-pop"
                          title="בוצע — לחץ לביטול"
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </button>
                      )
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleFailureDraft(currentExerciseIdx, i, currentExercise)}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold border-2 transition ${
                            draft.failure ? 'bg-orange text-ink border-orange' : 'border-line-strong text-text-mid hover:text-orange hover:border-orange/50'
                          }`}
                          title="סמן ככשל"
                        >
                          F
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSet(i)}
                          className="w-6 h-6 rounded-full border-2 border-line-strong hover:border-volt hover:bg-volt-soft transition flex items-center justify-center text-text-mid hover:text-volt"
                          title="סמן כבוצע"
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              )
            })
          })()}
        </div>

        <button
          onClick={handleAddSet}
          className="w-full py-2 rounded-elem text-xs font-medium border border-volt/40 text-volt hover:bg-volt-soft transition inline-flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> הוסף סט
        </button>

        {saving && (
          <p className="text-center text-xs text-text-mid">שומר...</p>
        )}
      </div>

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

      <button
        onClick={() => setShowAddExercise(true)}
        className="w-full bg-white/4 border border-line text-text-hi py-3 rounded-xl font-medium hover:bg-white/8 transition-colors min-h-[48px] flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> הוסף תרגיל לאימון
      </button>

      {/* Confirm finish dialog */}
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

      {/* Confirm discard dialog */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-2 border border-line-strong rounded-card p-6 w-full max-w-sm space-y-4 shadow-2xl anim-rise" dir="rtl">
            <h3 className="text-lg font-bold text-text-hi">לבטל את האימון?</h3>
            <p className="text-coral text-sm">כל ההתקדמות באימון הזה תימחק ולא תישמר</p>
            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                className="flex-1 bg-coral hover:brightness-105 text-ink py-3 rounded-elem font-bold active:scale-95 transition"
              >
                בטל אימון
              </button>
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 bg-white/4 border border-line text-text-mid py-3 rounded-elem font-medium hover:text-text-hi hover:bg-white/8 transition"
              >
                המשך אימון
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add exercise mid-workout (session-local, not saved to plan) */}
      {showAddExercise && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddExercise(false)}>
          <div
            className="bg-surface-2 border border-line-strong rounded-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-text-hi font-bold">הוסף תרגיל לאימון</h3>
              <button onClick={() => setShowAddExercise(false)} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddExerciseMode('search')}
                className={`flex-1 px-3 py-2 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
                  addExerciseMode === 'search' ? 'bg-volt text-ink' : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
                }`}
              >
                <Search className="w-4 h-4" /> בחר ממאגר
              </button>
              <button
                type="button"
                onClick={() => setAddExerciseMode('free')}
                className={`flex-1 px-3 py-2 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
                  addExerciseMode === 'free' ? 'bg-volt text-ink' : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
                }`}
              >
                <Type className="w-4 h-4" /> הוסף חופשי
              </button>
            </div>

            {addExerciseMode === 'search' ? (
              <ExerciseSearch onSelect={addExerciseToSession} />
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="שם התרגיל"
                  value={freeExName}
                  onChange={e => setFreeExName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddExerciseFree()}
                  className="input-volt"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {FREE_MUSCLE_GROUPS.map(mg => (
                    <button
                      key={mg}
                      type="button"
                      onClick={() => setFreeExMuscleGroup(mg)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        freeExMuscleGroup === mg ? 'bg-volt text-ink' : 'bg-white/6 text-text-mid opacity-70 hover:opacity-100'
                      }`}
                    >
                      {mg}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddExerciseFree}
                  disabled={!freeExName.trim()}
                  className="btn-volt w-full py-2 text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" /> הוסף תרגיל
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* In-workout settings — rest timer defaults, not a general app settings screen */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div
            className="bg-surface-2 border border-line-strong rounded-card w-full max-w-sm p-5 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-text-hi font-bold flex items-center gap-2">
                <Settings className="w-4.5 h-4.5" /> הגדרות אימון
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-text-mid text-sm">זמן מנוחה ברירת מחדל (שניות)</label>
              <input
                type="number"
                min="0"
                placeholder="לפי התוכנית (ברירת מחדל)"
                value={restTimerOverride}
                onChange={e => setRestTimerOverride(e.target.value)}
                className="input-volt"
                dir="ltr"
              />
              <p className="text-text-low text-xs">השאר ריק כדי להשתמש בזמן המנוחה שמוגדר לכל תרגיל בתוכנית</p>
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-text-mid text-sm">התחלה אוטומטית של טיימר מנוחה</span>
              <button
                type="button"
                onClick={() => setAutoStartRest(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${autoStartRest ? 'bg-volt' : 'bg-white/15'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoStartRest ? 'right-0.5' : 'right-5.5'}`} />
              </button>
            </label>

            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="btn-volt w-full py-2.5 text-sm flex items-center justify-center gap-1.5"
            >
              {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />}
              {savingSettings ? 'שומר...' : 'שמור הגדרות'}
            </button>
          </div>
        </div>
      )}

      {/* Rest timer — sticky bottom bar */}
      <RestTimerBar
        restTimer={restTimer}
        restActive={restActive}
        initialRest={initialRest}
        skipRest={skipRest}
        addTime={addTime}
      />

      {showAnimation && currentExerciseMedia && (
        <ExerciseMediaModal
          name={currentExercise.name}
          animationWebpUrl={currentExerciseMedia.animation_webp_url}
          thumbnailPngUrl={currentExerciseMedia.thumbnail_png_url}
          videoMp4Url={currentExerciseMedia.video_mp4_url}
          tips={currentExerciseMedia.tips}
          onClose={() => setShowAnimation(false)}
        />
      )}
    </div>
  )
}
