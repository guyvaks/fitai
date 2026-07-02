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
    <div className="space-y-6 bg-light-bg p-6 rounded-card" dir="rtl">
      <h1 className="text-2xl font-bold text-dark-text">ההתקדמות שלי</h1>

      {/* Personal Records */}
      <div className="bg-white border border-light-border rounded-card p-5 space-y-3 shadow-sm">
        <h2 className="text-lg font-semibold text-dark-text">🏆 שיאים אישיים</h2>
        {loading ? (
          <p className="text-dark-text-muted text-sm">טוען...</p>
        ) : records.length === 0 ? (
          <p className="text-dark-text-muted text-sm">אין שיאים עדיין — צא לאימון!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-text-muted border-b border-light-border">
                  <th className="text-right py-2 font-medium">תרגיל</th>
                  <th className="text-center py-2 font-medium">משקל</th>
                  <th className="text-center py-2 font-medium">חזרות</th>
                  <th className="text-center py-2 font-medium">1RM</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="border-b border-light-border/50">
                    <td className="py-2 text-dark-text">{r.exercise_name}</td>
                    <td className="py-2 text-center text-dark-text">{r.record_weight_kg} ק״ג</td>
                    <td className="py-2 text-center text-dark-text-muted">{r.record_reps}</td>
                    <td className="py-2 text-center text-green-600">{r.calculated_1rm ? `${Math.round(r.calculated_1rm)} ק״ג` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Weekly calories bar chart */}
      <div className="bg-white border border-light-border rounded-card p-5 space-y-3 shadow-sm">
        <h2 className="text-lg font-semibold text-dark-text">📊 קלוריות שבועיות</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyCalories}>
            <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8 }}
              labelStyle={{ color: '#111827' }}
              itemStyle={{ color: '#2563EB' }}
            />
            <Bar dataKey="calories" fill="#2563EB" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Weight progress line chart */}
      <div className="bg-white border border-light-border rounded-card p-5 space-y-3 shadow-sm">
        <h2 className="text-lg font-semibold text-dark-text">⚖️ מגמת משקל</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={weightProgress}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="week" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8 }}
              labelStyle={{ color: '#111827' }}
              itemStyle={{ color: '#2563EB' }}
            />
            <Line type="monotone" dataKey="weight" stroke="#2563EB" strokeWidth={2} dot={{ fill: '#2563EB', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
