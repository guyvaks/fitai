import { useState, useEffect } from 'react'
import api from '../services/api'
import { Timer, Loader2 } from 'lucide-react'

// Compact, non-blocking card for confirming/changing the rest-time default
// (workout_preferences.rest_timer_seconds + auto_start_rest) at the moment a
// plan is created or approved -- deliberately NOT a modal/overlay, so it
// never gates the actual save/approve action the way the old LiveWorkout
// gear-icon modal did. Settings.jsx keeps its own full copy of the same two
// fields for anytime access.
//
// If `value` is provided, the card trusts it as the current rest-seconds
// default and skips its own profile fetch (the parent -- e.g.
// ManualWorkoutBuilder -- already loaded it for another reason); auto_start_rest
// is always fetched here regardless, since no parent passes it in today.
export default function RestTimeDefaultCard({ value, onSaved }) {
  const [restSeconds, setRestSeconds] = useState(value != null ? String(value) : '')
  const [autoStartRest, setAutoStartRest] = useState(true)
  const [loading, setLoading] = useState(value == null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // auto_start_rest isn't passed in by either consumer (ManualWorkoutBuilder
    // only passes rest-seconds via `value`), so it's always fetched here --
    // otherwise saving would silently reset it to the true default.
    api.get('/api/v1/users/profile')
      .then(({ data }) => {
        const prefs = data?.workout_preferences
        if (value == null && prefs?.rest_timer_seconds != null) setRestSeconds(String(prefs.rest_timer_seconds))
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
      </div>
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-text-mid text-xs">התחלה אוטומטית של טיימר מנוחה</span>
        <button
          type="button"
          onClick={() => { setAutoStartRest(v => !v); setSaved(false) }}
          disabled={loading}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${autoStartRest ? "bg-volt" : "bg-white/15"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoStartRest ? "right-0.5" : "right-5.5"}`} />
        </button>
      </label>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || loading}
        className="btn-volt w-full py-2 text-xs flex items-center justify-center gap-1"
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {saving ? 'שומר...' : saved ? 'נשמר ✓' : 'שמור'}
      </button>
    </div>
  )
}
