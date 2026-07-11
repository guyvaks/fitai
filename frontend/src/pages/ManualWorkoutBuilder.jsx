import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { workoutsAPI } from '../services/api'
import ExerciseSearch, { MUSCLE_GROUP_COLOR, MUSCLE_GROUPS } from '../components/ExerciseSearch'
import { Dumbbell, Search, Type, Plus, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'

const DAYS = [
  { key: 'sunday', label: 'ראשון' },
  { key: 'monday', label: 'שני' },
  { key: 'tuesday', label: 'שלישי' },
  { key: 'wednesday', label: 'רביעי' },
  { key: 'thursday', label: 'חמישי' },
  { key: 'friday', label: 'שישי' },
  { key: 'saturday', label: 'שבת' },
]

const FREE_MUSCLE_GROUPS = MUSCLE_GROUPS.filter(g => g !== 'כל הקבוצות')

function ExerciseCard({ exercise, onUpdateSet, onAddSet, onRemoveSet, onRemove, onMove, canMoveUp, canMoveDown }) {
  return (
    <div className="card-glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-full bg-volt-soft text-volt flex items-center justify-center shrink-0">
            <Dumbbell className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-text-hi text-sm truncate">{exercise.name}</p>
            {exercise.muscle_group && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${MUSCLE_GROUP_COLOR[exercise.muscle_group] || 'bg-white/6 text-text-mid'}`}>
                {exercise.muscle_group}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onMove.up} disabled={!canMoveUp} className="text-text-mid hover:text-text-hi disabled:opacity-20 transition p-1" aria-label="הזז למעלה">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={onMove.down} disabled={!canMoveDown} className="text-text-mid hover:text-text-hi disabled:opacity-20 transition p-1" aria-label="הזז למטה">
            <ChevronDown className="w-4 h-4" />
          </button>
          <button type="button" onClick={onRemove} className="text-text-mid hover:text-coral transition p-1" aria-label="הסר תרגיל">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sets table */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 text-center text-xs text-text-mid px-1">
          <span>סט</span>
          <span>ק"ג</span>
          <span>חזרות</span>
          <span />
        </div>
        {exercise.sets.map((set, si) => (
          <div key={si} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center">
            <span className="text-center text-text-mid text-sm font-medium tabular-nums">{si + 1}</span>
            <input
              type="number"
              min="0"
              value={set.weight_kg}
              onChange={e => onUpdateSet(si, 'weight_kg', e.target.value)}
              className="bg-white/6 border border-line-strong rounded-elem px-2 py-1.5 text-text-hi text-center text-sm focus:outline-none focus:border-volt/60"
            />
            <input
              type="number"
              min="0"
              value={set.reps}
              onChange={e => onUpdateSet(si, 'reps', e.target.value)}
              className="bg-white/6 border border-line-strong rounded-elem px-2 py-1.5 text-text-hi text-center text-sm focus:outline-none focus:border-volt/60"
            />
            <button
              type="button"
              onClick={() => onRemoveSet(si)}
              className="text-text-mid hover:text-coral transition p-1 justify-self-center"
              aria-label="הסר סט"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddSet}
        className="w-full py-1.5 rounded-elem text-xs font-medium border border-volt/40 text-volt hover:bg-volt-soft transition inline-flex items-center justify-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" /> הוסף סט
      </button>
    </div>
  )
}

export default function ManualWorkoutBuilder() {
  const navigate = useNavigate()
  const [activeDay, setActiveDay] = useState('sunday')
  const [week, setWeek] = useState({}) // { [day]: [{ name, muscle_group, notes, sets: [{weight_kg, reps}] }] }
  const [addMode, setAddMode] = useState('search') // 'search' | 'free'
  const [freeName, setFreeName] = useState('')
  const [freeMuscleGroup, setFreeMuscleGroup] = useState(FREE_MUSCLE_GROUPS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Load the existing active plan so edits merge onto it instead of replacing it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await workoutsAPI.getPlan()
        const planData = data?.plan_data || {}
        const loaded = {}
        for (const [day, dayData] of Object.entries(planData)) {
          const exercises = dayData?.exercises || []
          loaded[day] = exercises.map(ex => ({
            name: ex.name,
            muscle_group: ex.muscle_group || '',
            notes: ex.notes ?? null,
            sets: (ex.sets || []).map(s => ({ weight_kg: s.weight_kg ?? 0, reps: s.reps ?? 0 })),
          }))
        }
        if (!cancelled) setWeek(loaded)
      } catch (e) {
        // 404 = no active plan yet; start from empty, anything else is non-fatal here.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const dayExercises = week[activeDay] || []
  const totalExerciseCount = Object.values(week).reduce((sum, exs) => sum + exs.filter(e => e.sets.length > 0).length, 0)

  const addExerciseToDay = (exercise) => {
    setWeek(w => ({
      ...w,
      [activeDay]: [...(w[activeDay] || []), { ...exercise, sets: [{ weight_kg: 0, reps: 10 }] }],
    }))
  }

  const handleSelectFromSearch = (ex) => {
    addExerciseToDay({ name: ex.name, muscle_group: ex.muscle_group, notes: null })
  }

  const handleAddFree = () => {
    if (!freeName.trim()) return
    addExerciseToDay({ name: freeName.trim(), muscle_group: freeMuscleGroup, notes: null })
    setFreeName('')
  }

  const updateDayExercises = (updater) => {
    setWeek(w => ({ ...w, [activeDay]: updater([...(w[activeDay] || [])]) }))
  }

  const handleUpdateSet = (exIdx, setIdx, field, value) => {
    updateDayExercises(exs => {
      const ex = { ...exs[exIdx] }
      const sets = [...ex.sets]
      sets[setIdx] = { ...sets[setIdx], [field]: value }
      ex.sets = sets
      exs[exIdx] = ex
      return exs
    })
  }

  const handleAddSet = (exIdx) => {
    updateDayExercises(exs => {
      const ex = { ...exs[exIdx] }
      const last = ex.sets[ex.sets.length - 1] || { weight_kg: 0, reps: 10 }
      ex.sets = [...ex.sets, { ...last }]
      exs[exIdx] = ex
      return exs
    })
  }

  const handleRemoveSet = (exIdx, setIdx) => {
    updateDayExercises(exs => {
      const ex = { ...exs[exIdx] }
      ex.sets = ex.sets.filter((_, i) => i !== setIdx)
      exs[exIdx] = ex
      return exs
    })
  }

  const handleRemoveExercise = (exIdx) => {
    updateDayExercises(exs => exs.filter((_, i) => i !== exIdx))
  }

  const handleMoveExercise = (exIdx, dir) => {
    updateDayExercises(exs => {
      const target = exIdx + dir
      if (target < 0 || target >= exs.length) return exs
      const copy = [...exs]
      ;[copy[exIdx], copy[target]] = [copy[target], copy[exIdx]]
      return copy
    })
  }

  const handleSave = async () => {
    setError(null)
    if (totalExerciseCount === 0) {
      setError('נא להוסיף לפחות תרגיל אחד עם סט אחד לפחות')
      return
    }
    setSaving(true)
    try {
      const payload = {}
      for (const [day, exs] of Object.entries(week)) {
        const validExs = exs.filter(e => e.sets.length > 0 && e.name.trim())
        if (validExs.length > 0) {
          payload[day] = validExs.map(e => ({
            name: e.name,
            muscle_group: e.muscle_group || '',
            notes: e.notes || null,
            sets: e.sets.map(s => ({
              weight_kg: Math.max(0, parseFloat(s.weight_kg) || 0),
              reps: Math.max(1, parseInt(s.reps) || 1),
            })),
          }))
        }
      }
      await workoutsAPI.createManualPlan(payload)
      navigate('/workouts')
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בשמירת התוכנית')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-8" dir="rtl">
      <h1 className="text-3xl font-extrabold text-text-hi tracking-tight anim-rise">בניית תוכנית אימונים ידנית</h1>

      {error && (
        <div className="bg-coral-soft border border-coral/30 rounded-card p-4 text-coral text-sm">
          {error}
        </div>
      )}

      {/* Day tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {DAYS.map(d => {
          const count = (week[d.key] || []).filter(e => e.sets.length > 0).length
          return (
            <button
              key={d.key}
              onClick={() => setActiveDay(d.key)}
              className={`px-3 py-2 rounded-elem text-sm font-medium whitespace-nowrap transition ${
                activeDay === d.key
                  ? 'bg-volt text-ink'
                  : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
              }`}
            >
              {d.label}{count > 0 && <span className="mr-1 opacity-70" dir="ltr">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Add exercise panel */}
      <div className="card-glass p-4 space-y-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAddMode('search')}
            className={`flex-1 px-3 py-2 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
              addMode === 'search' ? 'bg-volt text-ink' : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
            }`}
          >
            <Search className="w-4 h-4" /> בחר ממאגר
          </button>
          <button
            type="button"
            onClick={() => setAddMode('free')}
            className={`flex-1 px-3 py-2 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
              addMode === 'free' ? 'bg-volt text-ink' : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
            }`}
          >
            <Type className="w-4 h-4" /> הוסף חופשי
          </button>
        </div>

        {addMode === 'search' ? (
          <ExerciseSearch onSelect={handleSelectFromSearch} />
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="שם התרגיל"
              value={freeName}
              onChange={e => setFreeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddFree()}
              className="input-volt"
            />
            <div className="flex gap-1.5 flex-wrap">
              {FREE_MUSCLE_GROUPS.map(mg => (
                <button
                  key={mg}
                  type="button"
                  onClick={() => setFreeMuscleGroup(mg)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    freeMuscleGroup === mg
                      ? 'bg-volt text-ink'
                      : `${MUSCLE_GROUP_COLOR[mg] || 'bg-white/6 text-text-mid'} opacity-70 hover:opacity-100`
                  }`}
                >
                  {mg}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddFree}
              disabled={!freeName.trim()}
              className="btn-volt w-full py-2 text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> הוסף תרגיל
            </button>
          </div>
        )}
      </div>

      {/* Day's exercises */}
      <div className="space-y-3">
        <h2 className="text-text-hi font-bold text-sm">
          {DAYS.find(d => d.key === activeDay)?.label} · <span dir="ltr">{dayExercises.length}</span> תרגילים
        </h2>
        {dayExercises.length === 0 ? (
          <p className="text-text-mid text-sm text-center py-6 bg-white/4 border border-line rounded-elem">אין תרגילים עדיין ליום זה</p>
        ) : (
          dayExercises.map((ex, i) => (
            <ExerciseCard
              key={i}
              exercise={ex}
              onUpdateSet={(si, field, value) => handleUpdateSet(i, si, field, value)}
              onAddSet={() => handleAddSet(i)}
              onRemoveSet={(si) => handleRemoveSet(i, si)}
              onRemove={() => handleRemoveExercise(i)}
              onMove={{ up: () => handleMoveExercise(i, -1), down: () => handleMoveExercise(i, 1) }}
              canMoveUp={i > 0}
              canMoveDown={i < dayExercises.length - 1}
            />
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-volt flex-1 py-3 text-sm flex items-center justify-center gap-1.5"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'שומר...' : <>שמור תוכנית (<span dir="ltr">{totalExerciseCount}</span> תרגילים)</>}
        </button>
        <button
          onClick={() => navigate('/workouts')}
          className="px-5 py-3 rounded-elem text-sm font-medium border border-line text-text-mid hover:text-text-hi hover:bg-white/6 transition"
        >
          ביטול
        </button>
      </div>
    </div>
  )
}
