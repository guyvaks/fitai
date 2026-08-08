import { useEffect, useState } from 'react'
import { exercisesAPI } from '../services/api'

// Module-level cache: several components (ExerciseSearch, LiveWorkout) can
// mount at once and all want the same 384-row catalog -- share one fetch
// instead of one per mounted component.
let cachedPromise = null

function fetchMasterList() {
  if (!cachedPromise) {
    cachedPromise = exercisesAPI.getMaster().then(r => r.data).catch(err => {
      cachedPromise = null // allow retry on next mount if the fetch failed
      throw err
    })
  }
  return cachedPromise
}

// Returns the full exercises_master list plus a canonical_name_he -> row
// lookup map, for matching a workout plan's free-text exercise.name against
// the catalog to find its thumbnail/animation. Rows with no exercise_id
// (the ~20 pre-reseed exercises the CSV didn't cover) have no media and are
// simply absent from the map -- callers should treat a missing match as
// "no media available", not an error.
export function useExerciseMasterMedia() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchMasterList()
      .then(data => { if (!cancelled) setList(data) })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const byNameHe = new Map()
  for (const ex of list) {
    if (ex.exercise_id) byNameHe.set(ex.canonical_name_he, ex)
  }

  return { list, byNameHe, loading, error }
}
