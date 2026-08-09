// A plan exercise's target reps is either a range {min, max} (current
// shape, from both the AI agent and ManualWorkoutBuilder) or a plain number
// (old plans, pre rep-ranges feature). Every reader normalizes through this
// module instead of assuming either shape directly, so old plans keep
// working with zero DB migration -- a plain number just becomes a
// degenerate [n, n] range.

export function normalizeReps(reps) {
  if (reps && typeof reps === 'object' && 'min' in reps && 'max' in reps) {
    const min = Number(reps.min) || 0
    const max = Number(reps.max) || 0
    return { min, max }
  }
  const n = Number(reps) || 0
  return { min: n, max: n }
}

export function formatReps(reps) {
  const { min, max } = normalizeReps(reps)
  return min === max ? `${min}` : `${min}-${max}`
}
