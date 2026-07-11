import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { workoutsAPI, usersAPI } from '../services/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Trophy, Plus, Loader2 } from 'lucide-react'

const PERIODS = ['שבוע', 'חודש', 'שנה']

const PERIOD_DAYS = { 'שבוע': 7, 'חודש': 30, 'שנה': 365 }

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

function TrendChart({ title, unit, data, color, gradientId, changeLabel, changePositive }) {
  const [period, setPeriod] = useState('חודש')
  const series = data[period]
  const isDynamicChange = typeof changeLabel === 'function'
  const resolvedChangeText = isDynamicChange ? changeLabel(series).text : changeLabel
  const resolvedChangePositive = isDynamicChange ? changeLabel(series).positive : changePositive

  const periodButtons = (
    <div className="flex gap-1 bg-white/4 border border-line rounded-full p-1">
      {PERIODS.map(p => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition ${
            period === p ? 'bg-volt text-ink' : 'text-text-mid hover:text-text-hi'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )

  if (series.length < 2) {
    return (
      <div className="card-glass p-5">
        <div className="flex items-center justify-between mb-1">
          {periodButtons}
          <h3 className="text-text-mid text-sm">{title}</h3>
        </div>
        <div className="h-[180px] flex items-center justify-center text-text-mid text-sm text-center px-6">
          עדיין אין מספיק נתונים להצגת מגמה
        </div>
      </div>
    )
  }

  const latest = series[series.length - 1].value

  return (
    <div className="card-glass p-5">
      <div className="flex items-center justify-between mb-1">
        {periodButtons}
        <div className="text-left">
          <h3 className="text-text-mid text-sm">{title}</h3>
          <div className="flex items-center gap-2 justify-end">
            {resolvedChangeText && (
              <span className={`text-xs font-medium ${resolvedChangePositive ? 'text-volt' : 'text-coral'}`} dir="ltr">{resolvedChangeText}</span>
            )}
            <span className="text-2xl font-extrabold text-text-hi tabular-nums" dir="ltr">{latest.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={series}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#1A2234', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 }}
            labelStyle={{ color: '#F1F5F9' }}
            formatter={(v) => [`${v}${unit}`, title]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
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
  }, [])

  const weightSeriesByPeriod = buildWeightSeriesByPeriod(weightHistory)
  const volumeSeriesByPeriod = buildVolumeSeriesByPeriod(volumeHistory)

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-3xl font-extrabold text-text-hi tracking-tight anim-rise">התקדמות ומדדים</h1>

      {/* Trend charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 anim-rise anim-d1">
        <TrendChart
          title="נפח אימון (ק״ג)"
          unit=""
          data={volumeSeriesByPeriod}
          color="#A3E635"
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
    </div>
  )
}
