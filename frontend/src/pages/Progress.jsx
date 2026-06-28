import { useState, useEffect } from 'react'
import { workoutsAPI } from '../services/api'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid
} from 'recharts'

const weeklyCalories = [
  { day: 'א׳', calories: 2100 },
  { day: 'ב׳', calories: 1950 },
  { day: 'ג׳', calories: 2300 },
  { day: 'ד׳', calories: 1800 },
  { day: 'ה׳', calories: 2150 },
  { day: 'ו׳', calories: 2400 },
  { day: 'ש׳', calories: 1700 },
]

const weightProgress = [
  { week: 'שבוע 1', weight: 82 },
  { week: 'שבוע 2', weight: 81.5 },
  { week: 'שבוע 3', weight: 81.2 },
  { week: 'שבוע 4', weight: 80.8 },
  { week: 'שבוע 5', weight: 80.3 },
  { week: 'שבוע 6', weight: 79.9 },
]

export default function Progress() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    workoutsAPI.getPersonalRecords()
      .then(({ data }) => setRecords(data))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-text-main">ההתקדמות שלי</h1>

      {/* Personal Records */}
      <div className="bg-surface rounded-card p-5 space-y-3">
        <h2 className="text-lg font-semibold text-text-main">🏆 שיאים אישיים</h2>
        {loading ? (
          <p className="text-text-muted text-sm">טוען...</p>
        ) : records.length === 0 ? (
          <p className="text-text-muted text-sm">אין שיאים עדיין — צא לאימון!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-right py-2 font-medium">תרגיל</th>
                  <th className="text-center py-2 font-medium">משקל</th>
                  <th className="text-center py-2 font-medium">חזרות</th>
                  <th className="text-center py-2 font-medium">1RM</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2 text-text-main">{r.exercise_name}</td>
                    <td className="py-2 text-center text-text-main">{r.record_weight_kg} ק״ג</td>
                    <td className="py-2 text-center text-text-muted">{r.record_reps}</td>
                    <td className="py-2 text-center text-green-400">{r.calculated_1rm ? `${Math.round(r.calculated_1rm)} ק״ג` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weekly calories bar chart */}
      <div className="bg-surface rounded-card p-5 space-y-3">
        <h2 className="text-lg font-semibold text-text-main">📊 קלוריות שבועיות</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyCalories}>
            <XAxis dataKey="day" tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1E293B', border: 'none', borderRadius: 8 }}
              labelStyle={{ color: '#F8FAFC' }}
              itemStyle={{ color: '#22C55E' }}
            />
            <Bar dataKey="calories" fill="#22C55E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Weight progress line chart */}
      <div className="bg-surface rounded-card p-5 space-y-3">
        <h2 className="text-lg font-semibold text-text-main">⚖️ מגמת משקל</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={weightProgress}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis dataKey="week" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1E293B', border: 'none', borderRadius: 8 }}
              labelStyle={{ color: '#F8FAFC' }}
              itemStyle={{ color: '#3B82F6' }}
            />
            <Line type="monotone" dataKey="weight" stroke="#3B82F6" strokeWidth={2} dot={{ fill: '#3B82F6', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
