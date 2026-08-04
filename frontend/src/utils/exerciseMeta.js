// exercises_master.muscle_group_primary / .equipment use an English
// vocabulary (see backend app/services/crew_agents.py's own note on this
// same mismatch for equipment). There was no existing Hebrew label mapping
// for either anywhere in the app -- Admin.jsx just prints the raw English
// values. This is the one place that translates them for user-facing UI.

export const MUSCLE_GROUP_LABELS = {
  Abdominals: 'בטן',
  Abductors: 'מרחיקי ירך',
  Adductors: 'מקרבי ירך',
  Biceps: 'ביצפס',
  Calves: 'שוקיים',
  Cardio: 'אירובי',
  Chest: 'חזה',
  Forearms: 'אמות',
  'Full Body': 'גוף מלא',
  Glutes: 'ישבן',
  Hamstrings: 'המסטרינג',
  Lats: 'גב רחב',
  'Lower Back': 'גב תחתון',
  Neck: 'צוואר',
  Other: 'אחר',
  Quadriceps: 'ירך קדמית',
  Shoulders: 'כתפיים',
  Traps: 'טרפז',
  Triceps: 'טריצפס',
  'Upper Back': 'גב עליון',
}

// Keyed by the *Hebrew label* (not the English source value) because
// downstream call sites (ManualWorkoutBuilder, LiveWorkout) already store
// exercise.muscle_group as a plain Hebrew string from before this reseed --
// keeping that contract means those files need zero changes.
export const MUSCLE_GROUP_COLOR = {
  'בטן': 'bg-teal-400/15 text-teal-300',
  'מרחיקי ירך': 'bg-amber-soft text-amber',
  'מקרבי ירך': 'bg-amber-soft text-amber',
  'ביצפס': 'bg-orange-400/15 text-orange-300',
  'שוקיים': 'bg-amber-soft text-amber',
  'אירובי': 'bg-rose-400/15 text-rose-300',
  'חזה': 'bg-cyan-soft text-cyan',
  'אמות': 'bg-orange-400/15 text-orange-300',
  'גוף מלא': 'bg-lime-400/15 text-lime-300',
  'ישבן': 'bg-amber-soft text-amber',
  'המסטרינג': 'bg-amber-soft text-amber',
  'גב רחב': 'bg-violet-soft text-violet',
  'גב תחתון': 'bg-violet-soft text-violet',
  'צוואר': 'bg-white/6 text-text-mid',
  'אחר': 'bg-white/6 text-text-mid',
  'ירך קדמית': 'bg-amber-soft text-amber',
  'כתפיים': 'bg-volt-soft text-volt',
  'טרפז': 'bg-violet-soft text-violet',
  'טריצפס': 'bg-coral-soft text-coral',
  'גב עליון': 'bg-violet-soft text-violet',
}

export const EQUIPMENT_LABELS = {
  barbell: 'מוט',
  dumbbell: 'משקולות יד',
  kettlebell: 'קטלבל',
  machine: 'מכונה',
  none: 'ללא ציוד',
  other: 'אחר',
  plate: 'פלטות',
  resistance_band: 'גומיית התנגדות',
  suspension_band: 'רצועות תלייה',
}
