import { useState, useEffect, useRef } from 'react'
import { exercisesAPI } from '../services/api'
import { Loader2, Check } from 'lucide-react'

const MUSCLE_GROUP_COLOR = {
  'חזה':    'bg-cyan-soft text-cyan',
  'גב':     'bg-violet-soft text-violet',
  'רגליים': 'bg-amber-soft text-amber',
  'כתפיים': 'bg-volt-soft text-volt',
  'ביצפס':  'bg-orange-400/15 text-orange-300',
  'טריצפס': 'bg-coral-soft text-coral',
  'בטן':    'bg-teal-400/15 text-teal-300',
}

const MUSCLE_GROUPS = [
  'כל הקבוצות',
  'חזה',
  'גב',
  'רגליים',
  'כתפיים',
  'ביצפס',
  'טריצפס',
  'בטן',
]

// ─── Exercise Search + Grid ───────────────────────────────────────────────────
// addedNames (optional): a Set of exercise names already present in whatever
// list the caller is building (e.g. the active day in ManualWorkoutBuilder).
// Repeated clicks used to add silent duplicates -- once an exercise is in
// that set, its button disables and shows a checkmark instead. Callers that
// don't track "already added" (e.g. LiveWorkout's ad-hoc add-mid-session)
// simply omit the prop and every button behaves as before.
export default function ExerciseSearch({ onSelect, addedNames }) {
  const [query, setQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('כל הקבוצות')
  const [allExercises, setAllExercises] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    exercisesAPI.search('').then(r => setAllExercises(r.data)).catch(() => {})
  }, [])

  const doSearch = (q, mg) => {
    clearTimeout(debounceRef.current)
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await exercisesAPI.search(q, mg === 'כל הקבוצות' ? '' : mg)
        setAllExercises(r.data)
      } catch {
        setAllExercises([])
      } finally {
        setSearching(false)
      }
    }, 200)
  }

  const handleQueryChange = (e) => {
    const val = e.target.value
    setQuery(val)
    doSearch(val, muscleGroup)
  }

  const handleMuscleGroupChange = (mg) => {
    setMuscleGroup(mg)
    doSearch(query, mg)
  }

  const grouped = allExercises.reduce((acc, ex) => {
    if (!acc[ex.muscle_group]) acc[ex.muscle_group] = []
    acc[ex.muscle_group].push(ex)
    return acc
  }, {})

  const groupOrder = MUSCLE_GROUPS.filter(g => g !== 'כל הקבוצות' && grouped[g])

  return (
    <div className="space-y-3">
      <label className="text-text-mid text-xs block">חיפוש תרגיל</label>

      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {MUSCLE_GROUPS.map(mg => (
            <button
              key={mg}
              type="button"
              onClick={() => handleMuscleGroupChange(mg)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                muscleGroup === mg
                  ? 'bg-volt text-ink'
                  : mg === 'כל הקבוצות'
                    ? 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
                    : `${MUSCLE_GROUP_COLOR[mg] || 'bg-white/6 text-text-mid'} opacity-70 hover:opacity-100`
              }`}
            >
              {mg}
            </button>
          ))}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="חיפוש חופשי..."
            value={query}
            onChange={handleQueryChange}
            className="input-volt"
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mid w-3.5 h-3.5 animate-spin" />
          )}
        </div>
      </div>

      <div className="space-y-4 max-h-72 overflow-y-auto pl-1">
        {groupOrder.length === 0 && !searching && (
          <p className="text-text-mid text-sm text-center py-3">לא נמצאו תרגילים</p>
        )}
        {groupOrder.map(mg => (
          <div key={mg}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MUSCLE_GROUP_COLOR[mg] || 'bg-white/6 text-text-mid'}`}>
                {mg}
              </span>
              <span className="text-text-mid text-xs">{grouped[mg].length} תרגילים</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped[mg].map(ex => {
                const isAdded = addedNames?.has(ex.name)
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => { if (!isAdded) onSelect(ex) }}
                    disabled={isAdded}
                    aria-pressed={isAdded}
                    className={`border rounded-elem px-3 py-2 text-right transition-all group flex items-center justify-between gap-1.5 ${
                      isAdded
                        ? 'bg-volt-soft border-volt/40 cursor-default'
                        : 'bg-white/4 hover:bg-volt-soft hover:border-volt/40 border-line'
                    }`}
                  >
                    <p className={`text-xs font-medium leading-tight transition-colors truncate ${
                      isAdded ? 'text-volt' : 'text-text-hi group-hover:text-volt'
                    }`}>
                      {ex.name}
                    </p>
                    {isAdded && <Check className="w-3.5 h-3.5 text-volt shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export { MUSCLE_GROUP_COLOR, MUSCLE_GROUPS }
