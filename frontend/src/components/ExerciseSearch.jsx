import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Dumbbell, Play, ChevronDown } from 'lucide-react'
import { useExerciseMasterMedia } from '../hooks/useExerciseMasterMedia'
import { MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from '../utils/exerciseMeta'
import ExerciseMediaModal from './ExerciseMediaModal'

const MUSCLE_GROUP_OPTIONS = Object.entries(MUSCLE_GROUP_LABELS) // [englishKey, heLabel][]
const EQUIPMENT_OPTIONS = Object.entries(EQUIPMENT_LABELS) // [englishKey, heLabel][]

// ─── Exercise Search + List ────────────────────────────────────────────────
// Sourced from exercises_master (/api/v1/exercises/master, canonical
// exercises with resolved thumbnail/animation URLs) -- NOT the older, much
// smaller app/data/exercises.py autocomplete list that GET /exercises/search
// still serves. onSelect is called with the same {id, name, muscle_group}
// shape the old static-list version used (translated to Hebrew here), so
// ManualWorkoutBuilder/LiveWorkout's onSelect handlers didn't need to change.
//
// Flat list layout (Hevy-style reference): search bar, "כל הציוד"/"כל
// השרירים" filter pills with an inline dropdown each, then one row per
// result -- small thumbnail + name/muscle-group text, no grouped section
// headers (replaced by the two filter pills instead of visual grouping).
//
// addedNames (optional): a Set of exercise names already present in whatever
// list the caller is building (e.g. the active day in ManualWorkoutBuilder).
// Repeated clicks used to add silent duplicates -- once an exercise is in
// that set, its row disables and shows a checkmark instead. Callers that
// don't track "already added" (e.g. LiveWorkout's ad-hoc add-mid-session)
// simply omit the prop and every row behaves as before.
export default function ExerciseSearch({ onSelect, addedNames }) {
  const [query, setQuery] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('') // english key, '' = all
  const [equipment, setEquipment] = useState('') // english key, '' = all
  const [openDropdown, setOpenDropdown] = useState(null) // 'muscle' | 'equipment' | null
  const [previewExercise, setPreviewExercise] = useState(null)
  const { list, loading } = useExerciseMasterMedia()
  const filterRowRef = useRef(null)

  // Click-outside-to-close. Deliberately NOT a `fixed inset-0` overlay: this
  // app's mobile-frame wrapper (App.jsx) uses `transform` to re-scope
  // `position: fixed` descendants to the 430px frame, and several ancestors
  // in this tree (anim-rise, card-glass, etc.) also use transforms -- in
  // practice a fixed overlay here ends up confined to whichever nested
  // transformed ancestor happens to be closest, not the intended full area,
  // so clicks outside that (smaller, wrong) region never close the dropdown.
  // A document-level listener + ref check sidesteps the whole containing-
  // block question entirely.
  useEffect(() => {
    if (!openDropdown) return
    const handleClick = (e) => {
      if (filterRowRef.current && !filterRowRef.current.contains(e.target)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openDropdown])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return list
      .filter(ex => {
        if (q && !ex.canonical_name_he.includes(query.trim()) &&
            !(ex.canonical_name_en || '').toLowerCase().includes(q)) {
          return false
        }
        if (muscleGroup && ex.muscle_group_primary !== muscleGroup) return false
        if (equipment && ex.equipment !== equipment) return false
        return true
      })
      .sort((a, b) => a.canonical_name_he.localeCompare(b.canonical_name_he, 'he'))
  }, [list, query, muscleGroup, equipment])

  const handleSelect = (ex) => {
    onSelect({
      id: ex.exercise_id,
      name: ex.canonical_name_he,
      muscle_group: MUSCLE_GROUP_LABELS[ex.muscle_group_primary] || ex.muscle_group_primary,
    })
  }

  const toggleDropdown = (name) => setOpenDropdown(d => (d === name ? null : name))

  return (
    <div className="space-y-3">
      <label className="text-text-mid text-xs block">חיפוש תרגיל</label>

      <div className="relative">
        <input
          type="text"
          placeholder="חיפוש חופשי..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="input-volt"
          autoComplete="off"
        />
      </div>

      <div className="flex gap-2" ref={filterRowRef}>
        {/* Equipment filter pill */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => toggleDropdown('equipment')}
            className="w-full flex items-center justify-between gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white/4 border border-line text-text-mid hover:text-text-hi transition"
          >
            <span className="truncate">{equipment ? EQUIPMENT_LABELS[equipment] : 'כל הציוד'}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
          {openDropdown === 'equipment' && (
            <div className="absolute z-30 mt-1 w-full min-w-[160px] rounded-[var(--radius-card)] border border-line-strong bg-surface-2/95 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.35)] max-h-60 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setEquipment(''); setOpenDropdown(null) }}
                  className={`w-full text-right px-3 py-2 text-xs hover:bg-white/6 ${!equipment ? 'text-volt font-semibold' : 'text-text-hi'}`}
                >
                  כל הציוד
                </button>
                {EQUIPMENT_OPTIONS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setEquipment(key); setOpenDropdown(null) }}
                    className={`w-full text-right px-3 py-2 text-xs hover:bg-white/6 ${equipment === key ? 'text-volt font-semibold' : 'text-text-hi'}`}
                  >
                    {label}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Muscle group filter pill */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => toggleDropdown('muscle')}
            className="w-full flex items-center justify-between gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white/4 border border-line text-text-mid hover:text-text-hi transition"
          >
            <span className="truncate">{muscleGroup ? MUSCLE_GROUP_LABELS[muscleGroup] : 'כל השרירים'}</span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          </button>
          {openDropdown === 'muscle' && (
            <div className="absolute z-30 mt-1 w-full min-w-[160px] rounded-[var(--radius-card)] border border-line-strong bg-surface-2/95 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.35)] max-h-60 overflow-y-auto">
              <button
                type="button"
                onClick={() => { setMuscleGroup(''); setOpenDropdown(null) }}
                className={`w-full text-right px-3 py-2 text-xs hover:bg-white/6 ${!muscleGroup ? 'text-volt font-semibold' : 'text-text-hi'}`}
              >
                כל השרירים
              </button>
              {MUSCLE_GROUP_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setMuscleGroup(key); setOpenDropdown(null) }}
                  className={`w-full text-right px-3 py-2 text-xs hover:bg-white/6 ${muscleGroup === key ? 'text-volt font-semibold' : 'text-text-hi'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto -mx-1 px-1">
        {loading && (
          <p className="text-text-mid text-sm text-center py-3">טוען תרגילים...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-text-mid text-sm text-center py-3">לא נמצאו תרגילים</p>
        )}
        {filtered.map(ex => {
          const isAdded = addedNames?.has(ex.canonical_name_he)
          const heMuscle = MUSCLE_GROUP_LABELS[ex.muscle_group_primary] || ex.muscle_group_primary
          return (
            <div
              key={ex.id}
              className={`flex items-center gap-3 py-2 border-b border-line/60 last:border-b-0 ${isAdded ? 'opacity-80' : ''}`}
            >
              <button
                type="button"
                onClick={() => setPreviewExercise(ex)}
                disabled={!ex.animation_webp_url}
                className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 disabled:cursor-default"
                aria-label={`הצג הדגמה: ${ex.canonical_name_he}`}
              >
                {ex.thumbnail_png_url ? (
                  <img src={ex.thumbnail_png_url} alt="" className="w-full h-full object-cover bg-white/6" />
                ) : (
                  <span className="w-full h-full bg-white/6 flex items-center justify-center">
                    <Dumbbell className="w-5 h-5 text-text-mid" />
                  </span>
                )}
                {ex.animation_webp_url && (
                  <span className="absolute bottom-0.5 left-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center">
                    <Play className="w-2 h-2 text-white fill-white" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => { if (!isAdded) handleSelect(ex) }}
                disabled={isAdded}
                aria-pressed={isAdded}
                className="flex-1 min-w-0 text-right flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className={`text-sm font-medium leading-tight truncate ${isAdded ? 'text-volt' : 'text-text-hi'}`}>
                    {ex.canonical_name_he}
                  </p>
                  <p className="text-text-mid text-xs truncate">{heMuscle}</p>
                </div>
                {isAdded && <Check className="w-4 h-4 text-volt shrink-0" />}
              </button>
            </div>
          )
        })}
      </div>

      {previewExercise && (
        <ExerciseMediaModal
          name={previewExercise.canonical_name_he}
          animationWebpUrl={previewExercise.animation_webp_url}
          thumbnailPngUrl={previewExercise.thumbnail_png_url}
          tips={previewExercise.tips}
          onClose={() => setPreviewExercise(null)}
        />
      )}
    </div>
  )
}
