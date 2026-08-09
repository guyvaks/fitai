import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

export const PERIODS = ['שבוע', 'חודש', 'שנה']

export const PERIOD_DAYS = { 'שבוע': 7, 'חודש': 30, 'שנה': 365 }

export function TrendChart({ title, unit, data, color, gradientId, changeLabel, changePositive }) {
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
