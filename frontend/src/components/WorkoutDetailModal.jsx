import { useState, useEffect } from 'react'
import { X, Clock, Weight, Layers, Flame, Loader2 } from 'lucide-react'
import { workoutsAPI } from '../services/api'

const MUSCLE_COLORS = ['#A3E635', '#22D3EE', '#FBBF24', '#FB7185', '#C084FC', '#60A5FA']

function formatDuration(seconds) {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}ש׳ ${m}ד׳`
  return `${m} דקות`
}

export default function WorkoutDetailModal({ sessionId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    workoutsAPI.getSessionDetail(sessionId)
      .then(({ data }) => setDetail(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface-2 border border-line-strong rounded-card w-full max-w-sm p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-text-hi font-bold">פירוט אימון</h3>
          <button onClick={onClose} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex justify-center items-center gap-2 h-32 text-text-mid text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-volt" /> טוען...
          </div>
        )}

        {!loading && error && (
          <p className="text-coral text-sm text-center py-6">לא הצלחנו לטעון את פרטי האימון</p>
        )}

        {!loading && !error && detail && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="card-glass p-3 flex items-center gap-2.5">
                <Clock className="w-4.5 h-4.5 text-volt shrink-0" />
                <div>
                  <p className="text-text-low text-xs">משך</p>
                  <p className="text-text-hi font-bold text-sm">{formatDuration(detail.duration_seconds)}</p>
                </div>
              </div>
              <div className="card-glass p-3 flex items-center gap-2.5">
                <Weight className="w-4.5 h-4.5 text-cyan shrink-0" />
                <div>
                  <p className="text-text-low text-xs">נפח כולל</p>
                  <p className="text-text-hi font-bold text-sm" dir="ltr">{detail.total_volume_kg.toLocaleString()} ק״ג</p>
                </div>
              </div>
              <div className="card-glass p-3 flex items-center gap-2.5">
                <Layers className="w-4.5 h-4.5 text-amber shrink-0" />
                <div>
                  <p className="text-text-low text-xs">סטים</p>
                  <p className="text-text-hi font-bold text-sm">{detail.total_sets}</p>
                </div>
              </div>
              <div className="card-glass p-3 flex items-center gap-2.5">
                <Flame className="w-4.5 h-4.5 text-coral shrink-0" />
                <div>
                  <p className="text-text-low text-xs">קלוריות (הערכה)</p>
                  <p className="text-text-hi font-bold text-sm" dir="ltr">
                    {detail.estimated_calories != null ? detail.estimated_calories.toLocaleString() : '—'}
                  </p>
                </div>
              </div>
            </div>

            {detail.muscle_split.length > 0 && (
              <div className="space-y-2">
                <p className="text-text-mid text-sm font-medium">התפלגות שרירים</p>
                {detail.muscle_split.map((row, i) => (
                  <div key={row.muscle_group} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-hi">{row.muscle_group}</span>
                      <span className="text-text-mid" dir="ltr">{row.percentage}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${row.percentage}%`,
                          backgroundColor: MUSCLE_COLORS[i % MUSCLE_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
