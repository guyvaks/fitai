import { useState, useEffect } from 'react'
import api from '../services/api'
import { Timer, Loader2 } from 'lucide-react'

// Compact, non-blocking card for confirming/changing the rest-time default
// (workout_preferences.rest_timer_seconds) at the moment a plan is created
// or approved -- deliberately NOT a modal/overlay, so it never gates the
// actual save/approve action the way the old LiveWorkout gear-icon modal
// did. Settings.jsx keeps its own full copy of this control (including the
// unrelated auto_start_rest toggle, out of scope here) for anytime access.
//
// If `value` is provided, the card trusts it as the current default and
// skips its own profile fetch (the parent -- e.g. ManualWorkoutBuilder --
// already loaded it for another reason). Otherwise it fetches on mount.
export default function RestTimeDefaultCard({ value, onSaved }) {
  const [restSeconds, setRestSeconds] = useState(value != null ? String(value) : '')
  const [autoStartRest, setAutoStartRest] = useState(true) // preserved on save, not editable here
  const [loading, setLoading] = useState(value == null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (value != null) return
    api.get('/api/v1/users/profile')
      .then(({ data }) => {
        const prefs = data?.workout_preferences
        if (prefs?.rest_timer_seconds != null) setRestSeconds(String(prefs.rest_timer_seconds))
        if (prefs?.auto_start_rest === false) setAutoStartRest(false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [value])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const seconds = parseInt(restSeconds, 10)
      const finalSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : null
      // workout_preferences is replaced wholesale by PUT /users/profile (no
      // server-side merge) -- must resend auto_start_rest here too, or a
      // save from this card would silently wipe whatever Settings.jsx set.
      await api.put('/api/v1/users/profile', {
        workout_preferences: { rest_timer_seconds: finalSeconds, auto_start_rest: autoStartRest },
      })
      setSaved(true)
      onSaved?.(finalSeconds)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card-glass p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Timer className="w-4 h-4 text-volt shrink-0" />
        <span className="text-text-hi text-sm font-semibold">ברירת מחדל לזמן מנוחה</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0"
          placeholder="לפי התוכנית"
          value={restSeconds}
          onChange={e => { setRestSeconds(e.target.value); setSaved(false) }}
          disabled={loading}
          className="input-volt flex-1 min-w-0"
          dir="ltr"
        />
        <span className="text-text-mid text-xs shrink-0">שניות</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="btn-volt px-3 py-2 text-xs shrink-0 flex items-center gap-1"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'שומר...' : saved ? 'נשמר ✓' : 'שמור'}
        </button>
      </div>
    </div>
  )
}
