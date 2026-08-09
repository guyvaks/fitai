import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { workoutsAPI, usersAPI } from '../services/api'
import { Trophy, Plus, Loader2, Dumbbell, Clock, Weight, ChevronLeft } from 'lucide-react'
import WorkoutDetailModal from '../components/WorkoutDetailModal'
import { TrendChart, PERIOD_DAYS } from '../components/TrendChart'

function formatSessionDuration(seconds) {
  if (seconds == null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}ש׳ ${m}ד׳`
  return `${m} ד׳`
}

function buildWeightSeriesByPeriod(history) {
  const series = {}
  for (const [period, days] of Object.entries(PERIOD_DAYS)) {
    const cutoff = Date.now() - days * 86400000
    series[period] = history
      .filter((e) => new Date(e.date).getTime() >= cutoff)
      .map((e) => ({
        label: new Date(e.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
        value: e.weight_kg,
      }))
  }
  return series
}

function weightChangeLabel(series) {
  if (series.length < 2) return { text: '', positive: true }
  const diff = series[series.length - 1].value - series[0].value
  const sign = diff > 0 ? '+' : ''
  return { text: `${sign}${diff.toFixed(1)} ק״ג`, positive: diff >= 0 }
}

function buildVolumeSeriesByPeriod(history) {
  const series = {}
  for (const [period, days] of Object.entries(PERIOD_DAYS)) {
    const cutoff = Date.now() - days * 86400000
    series[period] = history
      .filter((e) => new Date(e.date).getTime() >= cutoff)
      .map((e) => ({
        label: new Date(e.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
        value: e.volume_kg,
      }))
  }
  return series
}

function volumeChangeLabel(series) {
  if (series.length < 2) return { text: '', positive: true }
  const first = series[0].value
  const last = series[series.length - 1].value
  if (!first) return { text: '', positive: true }
  const pct = ((last - first) / first) * 100
  const sign = pct > 0 ? '+' : ''
  return { text: `${sign}${pct.toFixed(0)}%`, positive: pct >= 0 }
}

function buildFrequencySeriesByPeriod(history) {
  const series = {}
  for (const [period, days] of Object.entries(PERIOD_DAYS)) {
    const cutoff = Date.now() - days * 86400000
    series[period] = history
      .filter((e) => new Date(e.week_start).getTime() >= cutoff)
      .map((e) => ({
        label: new Date(e.week_start).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
        value: e.sessions_completed,
      }))
  }
  return series
}

function frequencyChangeLabel(series) {
  if (series.length < 2) return { text: '', positive: true }
  const diff = series[series.length - 1].value - series[0].value
  const sign = diff > 0 ? '+' : ''
  return { text: `${sign}${diff}`, positive: diff >= 0 }
}

function isRecent(dateStr) {
  if (!dateStr) return false
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000
  return days <= 14
}

export default function Progress() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [weightHistory, setWeightHistory] = useState([])
  const [volumeHistory, setVolumeHistory] = useState([])
  const [frequencyHistory, setFrequencyHistory] = useState([])
  const [sessionsHistory, setSessionsHistory] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [hasMoreSessions, setHasMoreSessions] = useState(false)
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false)
  const [openSessionId, setOpenSessionId] = useState(null)

  const SESSIONS_PAGE_SIZE = 20

  useEffect(() => {
    workoutsAPI.getPersonalRecords()
      .then(({ data }) => setRecords(data))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))

    usersAPI.getWeightHistory()
      .then(({ data }) => setWeightHistory(data || []))
      .catch(() => setWeightHistory([]))

    workoutsAPI.getVolumeHistory()
      .then(({ data }) => setVolumeHistory(data || []))
      .catch(() => setVolumeHistory([]))

    workoutsAPI.getFrequencyHistory(52)
      .then(({ data }) => setFrequencyHistory(data || []))
      .catch(() => setFrequencyHistory([]))

    workoutsAPI.getSessionsHistory(SESSIONS_PAGE_SIZE, 0)
      .then(({ data }) => {
        setSessionsHistory(data || [])
        setHasMoreSessions((data || []).length === SESSIONS_PAGE_SIZE)
      })
      .catch(() => setSessionsHistory([]))
      .finally(() => setSessionsLoading(false))
  }, [])

  const loadMoreSessions = () => {
    setLoadingMoreSessions(true)
    workoutsAPI.getSessionsHistory(SESSIONS_PAGE_SIZE, sessionsHistory.length)
      .then(({ data }) => {
        setSessionsHistory(prev => [...prev, ...(data || [])])
        setHasMoreSessions((data || []).length === SESSIONS_PAGE_SIZE)
      })
      .catch(() => setHasMoreSessions(false))
      .finally(() => setLoadingMoreSessions(false))
  }

  const weightSeriesByPeriod = buildWeightSeriesByPeriod(weightHistory)
  const volumeSeriesByPeriod = buildVolumeSeriesByPeriod(volumeHistory)
  const frequencySeriesByPeriod = buildFrequencySeriesByPeriod(frequencyHistory)

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-3xl font-extrabold text-text-hi tracking-tight anim-rise">התקדמות ומדדים</h1>

      {/* Trend charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 anim-rise anim-d1">
        <TrendChart
          title="נפח אימון (ק״ג)"
          unit=""
          data={volumeSeriesByPeriod}
          color="var(--color-volt)"
          gradientId="volumeGradient"
          changeLabel={volumeChangeLabel}
        />
        <TrendChart
          title="משקל גוף (ק״ג)"
          unit=""
          data={weightSeriesByPeriod}
          color="#22D3EE"
          gradientId="weightGradient"
          changeLabel={weightChangeLabel}
        />
        <TrendChart
          title="תדירות אימונים (לשבוע)"
          unit=" אימונים"
          data={frequencySeriesByPeriod}
          color="#FBBF24"
          gradientId="frequencyGradient"
          changeLabel={frequencyChangeLabel}
        />
      </div>

      {/* Personal Records */}
      <div className="anim-rise anim-d2">
        <h2 className="text-lg font-bold text-text-hi mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber" /> שיאים אישיים
        </h2>
        {loading ? (
          <p className="text-text-mid text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-volt" /> טוען...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map(r => (
              <div key={r.id} className="card-glass card-hover p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-full bg-amber-soft text-amber flex items-center justify-center">
                    <Trophy className="w-4 h-4" />
                  </span>
                  {isRecent(r.achieved_at) && (
                    <span className="bg-amber text-ink text-[10px] font-bold px-2 py-0.5 rounded-full" dir="ltr">NEW RECORD</span>
                  )}
                </div>
                <p className="text-text-hi font-bold text-sm">{r.exercise_name}</p>
                <p className="text-text-hi" dir="ltr">
                  <span className="text-lg font-extrabold tabular-nums">{r.record_weight_kg} ק״ג</span>
                  <span className="text-text-mid text-sm tabular-nums"> x {r.record_reps} חזרות</span>
                </p>
                <p className="text-text-mid text-xs">
                  {r.achieved_at ? new Date(r.achieved_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                </p>
              </div>
            ))}
            <button
              onClick={() => navigate('/workouts')}
              className="border-2 border-dashed border-volt/40 bg-volt-soft/40 rounded-card p-4 flex flex-col items-center justify-center gap-2 text-volt hover:bg-volt-soft hover:border-volt/70 transition min-h-[140px] font-medium"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm">הוסף שיא אישי</span>
            </button>
          </div>
        )}
        {!loading && records.length === 0 && (
          <p className="text-text-mid text-sm mt-2">אין שיאים עדיין — צא לאימון!</p>
        )}
      </div>

      {/* Recent workouts */}
      <div className="anim-rise anim-d3">
        <h2 className="text-lg font-bold text-text-hi mb-3 flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-volt" /> אימונים אחרונים
        </h2>
        {sessionsLoading ? (
          <p className="text-text-mid text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-volt" /> טוען...</p>
        ) : sessionsHistory.length === 0 ? (
          <p className="text-text-mid text-sm">עדיין אין אימונים שהושלמו</p>
        ) : (
          <div className="space-y-2">
            {sessionsHistory.map((s) => (
              <button
                key={s.id}
                onClick={() => setOpenSessionId(s.id)}
                className="w-full card-glass card-hover p-4 flex items-center justify-between gap-3 text-right"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-text-hi font-medium text-sm">
                    {s.completed_at
                      ? new Date(s.completed_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
                      : ''}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-text-mid text-xs">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {formatSessionDuration(s.duration_seconds)}</span>
                    <span className="inline-flex items-center gap-1" dir="ltr"><Weight className="w-3 h-3" /> {s.total_volume_kg.toLocaleString()} ק״ג</span>
                    <span>{s.total_sets} סטים</span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-text-low shrink-0" />
              </button>
            ))}
            {hasMoreSessions && (
              <button
                onClick={loadMoreSessions}
                disabled={loadingMoreSessions}
                className="w-full card-glass card-hover p-3 flex items-center justify-center gap-2 text-text-mid hover:text-text-hi text-sm font-medium disabled:opacity-60"
              >
                {loadingMoreSessions ? <Loader2 className="w-4 h-4 animate-spin text-volt" /> : null}
                טען עוד
              </button>
            )}
          </div>
        )}
      </div>

      {openSessionId && (
        <WorkoutDetailModal sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
      )}
    </div>
  )
}
