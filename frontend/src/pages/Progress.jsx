import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { workoutsAPI } from '../services/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const PERIODS = ['שבוע', 'חודש', 'שנה']

const VOLUME_DATA = {
  'שבוע': [
    { label: '1', value: 8200 }, { label: '2', value: 8900 }, { label: '3', value: 8100 },
    { label: '4', value: 9500 }, { label: '5', value: 10200 }, { label: '6', value: 9800 }, { label: '7', value: 11400 },
  ],
  'חודש': [
    { label: '1 ביוני', value: 9800 }, { label: '10 ביוני', value: 10500 }, { label: '20 ביוני', value: 9900 }, { label: '30 ביוני', value: 14250 },
  ],
  'שנה': [
    { label: 'ינואר', value: 7200 }, { label: 'מרץ', value: 8400 }, { label: 'מאי', value: 9100 }, { label: 'יולי', value: 14250 },
  ],
}

const WEIGHT_DATA = {
  'שבוע': [
    { label: '1', value: 79.5 }, { label: '2', value: 79.3 }, { label: '3', value: 79.0 },
    { label: '4', value: 78.9 }, { label: '5', value: 78.7 }, { label: '6', value: 78.5 }, { label: '7', value: 78.4 },
  ],
  'חודש': [
    { label: '1 ביוני', value: 80.2 }, { label: '10 ביוני', value: 79.6 }, { label: '20 ביוני', value: 79.0 }, { label: '30 ביוני', value: 78.4 },
  ],
  'שנה': [
    { label: 'ינואר', value: 84.0 }, { label: 'מרץ', value: 81.5 }, { label: 'מאי', value: 79.8 }, { label: 'יולי', value: 78.4 },
  ],
}

function TrendChart({ title, unit, data, color, gradientId, changeLabel, changePositive }) {
  const [period, setPeriod] = useState('חודש')
  const series = data[period]
  const latest = series[series.length - 1].value

  return (
    <div className="bg-white border border-light-border rounded-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="flex gap-1 bg-gray-100 rounded-full p-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                period === p ? 'bg-white text-dark-text shadow-sm' : 'text-dark-text-muted'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="text-left">
          <h3 className="text-dark-text-muted text-sm">{title}</h3>
          <div className="flex items-center gap-2 justify-end">
            <span className={`text-xs font-medium ${changePositive ? 'text-green-600' : 'text-red-500'}`}>{changeLabel}</span>
            <span className="text-2xl font-bold text-dark-text" dir="ltr">{latest.toLocaleString()}</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={series}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8 }}
            labelStyle={{ color: '#111827' }}
            formatter={(v) => [`${v}${unit}`, title]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
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

  useEffect(() => {
    workoutsAPI.getPersonalRecords()
      .then(({ data }) => setRecords(data))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
      <h1 className="text-2xl font-bold text-dark-text">התקדמות ומדדים</h1>

      {/* Trend charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TrendChart
          title="נפח אימון (ק״ג)"
          unit=""
          data={VOLUME_DATA}
          color="#22C55E"
          gradientId="volumeGradient"
          changeLabel="12%+"
          changePositive
        />
        <TrendChart
          title="משקל גוף (ק״ג)"
          unit=""
          data={WEIGHT_DATA}
          color="#2563EB"
          gradientId="weightGradient"
          changeLabel="0.5- השבוע"
          changePositive={false}
        />
      </div>

      {/* Personal Records */}
      <div>
        <h2 className="text-lg font-semibold text-dark-text mb-3">🏆 שיאים אישיים</h2>
        {loading ? (
          <p className="text-dark-text-muted text-sm">טוען...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map(r => (
              <div key={r.id} className="bg-white border border-light-border rounded-card p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-full bg-yellow-50 flex items-center justify-center text-lg">🏆</span>
                  {isRecent(r.achieved_at) && (
                    <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">NEW RECORD</span>
                  )}
                </div>
                <p className="text-dark-text font-semibold text-sm">{r.exercise_name}</p>
                <p className="text-dark-text" dir="ltr">
                  <span className="text-lg font-bold">{r.record_weight_kg} ק״ג</span>
                  <span className="text-dark-text-muted text-sm"> x {r.record_reps} חזרות</span>
                </p>
                <p className="text-dark-text-muted text-xs">
                  {r.achieved_at ? new Date(r.achieved_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                </p>
              </div>
            ))}
            <button
              onClick={() => navigate('/workouts')}
              className="border-2 border-dashed border-accent-blue/40 bg-blue-50/50 rounded-card p-4 flex flex-col items-center justify-center gap-2 text-accent-blue hover:bg-blue-50 hover:border-accent-blue transition min-h-[140px] font-medium"
            >
              <span className="text-2xl">+</span>
              <span className="text-sm">+ הוסף שיא אישי</span>
            </button>
          </div>
        )}
        {!loading && records.length === 0 && (
          <p className="text-dark-text-muted text-sm mt-2">אין שיאים עדיין — צא לאימון!</p>
        )}
      </div>
    </div>
  )
}
