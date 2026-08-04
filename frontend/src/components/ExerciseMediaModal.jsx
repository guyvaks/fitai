import { useEffect, useRef, useState } from 'react'
import { X, Play, Pause, Trophy } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useCrossfadeWebpPlayer } from '../hooks/useCrossfadeWebpPlayer'
import { workoutsAPI } from '../services/api'

// Full-screen demo/history view for one exercise.
//
// The source .webp files are correctly authored at 1400ms/loop, 7 frames (4
// key poses + a return path) -- verified via raw WebP chunk parsing and the
// asset package's own audit. The "choppy" feel isn't a timing bug, it's the
// hard cut between only 4 unique poses -- see useCrossfadeWebpPlayer for how
// that's addressed (continuous cross-fade, decoded once, driven by rAF) and
// why real optical-flow interpolation was rejected for this content.
//
// SPEED is a single fixed multiplier of the source's authored duration, not
// a user-facing control -- 3x slower than native, chosen after Guy's live
// judgment (2x still felt too fast).
const SPEED = 3

function CrossfadeCanvas({ src, playing }) {
  const canvasRef = useRef(null)
  useCrossfadeWebpPlayer(canvasRef, src, { playing, speed: SPEED })
  return <canvas ref={canvasRef} className="w-full h-64 object-contain" />
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Tips tab: muscle diagram (free reuse of the same thumbnail every other
// tab already uses) + numbered form-cue text. The cue text itself has no
// content behind it yet on purpose -- exercises_master.tips is a real
// column but deliberately unpopulated everywhere (see the model comment):
// populating accurate, exercise-specific coaching cues is a content-
// sourcing decision for Guy (manual authoring / AI-generated / licensed),
// not something to fabricate here. Shows an honest placeholder until then.
function TipsPanel({ name, thumbnailPngUrl, tips }) {
  return (
    <div className="space-y-3">
      {thumbnailPngUrl && (
        <div className="rounded-elem overflow-hidden bg-white/4 flex items-center justify-center">
          <img src={thumbnailPngUrl} alt={name} className="w-full h-48 object-contain" />
        </div>
      )}
      {tips?.length > 0 ? (
        <ol className="space-y-2 list-decimal pr-5 text-text-hi text-sm">
          {tips.map((tip, i) => <li key={i}>{tip}</li>)}
        </ol>
      ) : (
        <p className="text-text-mid text-sm text-center py-6">טיפי ביצוע לתרגיל זה יתווספו בקרוב</p>
      )}
    </div>
  )
}

// History tab: Weight PR / Volume PR cards, a weight-over-time graph with a
// 3-months/year range toggle, and a weekly log. Computed live from
// ExerciseLog server-side (GET /exercise-stats) -- NOT from PersonalRecord,
// which is read elsewhere in the app but has no write path anywhere, so is
// empty in practice.
function HistoryPanel({ name }) {
  const [range, setRange] = useState('3m')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    workoutsAPI.getExerciseStats(name, range)
      .then(({ data }) => { if (!cancelled) setStats(data) })
      .catch(() => { if (!cancelled) setStats(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [name, range])

  if (loading) {
    return <p className="text-text-mid text-sm text-center py-8">טוען היסטוריה...</p>
  }

  const hasAnyData = stats?.weight_pr || stats?.volume_pr || (stats?.graph?.length > 0)
  if (!hasAnyData) {
    return <p className="text-text-mid text-sm text-center py-8">עדיין אין היסטוריה לתרגיל זה</p>
  }

  const graphData = (stats.graph || []).map(p => ({
    label: new Date(p.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }),
    value: p.weight_kg,
  }))

  return (
    <div className="space-y-4 max-h-[26rem] overflow-y-auto -mx-1 px-1">
      {/* PR cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="card-glass p-3">
          <div className="flex items-center gap-1.5 text-amber text-xs font-semibold mb-1">
            <Trophy className="w-3.5 h-3.5" /> שיא משקל
          </div>
          {stats.weight_pr ? (
            <>
              <p className="text-text-hi text-lg font-extrabold tabular-nums" dir="ltr">
                {stats.weight_pr.weight_kg}kg × {stats.weight_pr.reps}
              </p>
              <p className="text-text-mid text-xs">{formatDate(stats.weight_pr.achieved_at)}</p>
            </>
          ) : (
            <p className="text-text-mid text-xs">אין נתונים</p>
          )}
        </div>
        <div className="card-glass p-3">
          <div className="flex items-center gap-1.5 text-cyan text-xs font-semibold mb-1">
            <Trophy className="w-3.5 h-3.5" /> שיא נפח
          </div>
          {stats.volume_pr ? (
            <>
              <p className="text-text-hi text-lg font-extrabold tabular-nums" dir="ltr">{stats.volume_pr.volume_kg}kg</p>
              <p className="text-text-mid text-xs">{formatDate(stats.volume_pr.achieved_at)}</p>
            </>
          ) : (
            <p className="text-text-mid text-xs">אין נתונים</p>
          )}
        </div>
      </div>

      {/* Weight-progress graph with 3-months/year toggle */}
      <div className="card-glass p-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex gap-1 bg-white/4 border border-line rounded-full p-1">
            {[{ key: '3m', label: '3 חודשים' }, { key: '1y', label: 'שנה' }].map(r => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  range === r.key ? 'bg-volt text-ink' : 'text-text-mid hover:text-text-hi'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <h4 className="text-text-mid text-xs">התקדמות משקל</h4>
        </div>
        {graphData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={graphData}>
              <defs>
                <linearGradient id="exerciseWeightGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a3e635" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#a3e635" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: '#1A2234', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12 }}
                labelStyle={{ color: '#F1F5F9' }}
                formatter={(v) => [`${v}kg`, 'משקל']}
              />
              <Area type="monotone" dataKey="value" stroke="#a3e635" strokeWidth={2.5} fill="url(#exerciseWeightGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-text-mid text-xs text-center py-6">עדיין אין מספיק נתונים להצגת גרף</p>
        )}
      </div>

      {/* Weekly log */}
      {stats.weekly_log?.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-text-mid text-xs px-1">יומן שבועי</h4>
          {stats.weekly_log.map(week => (
            <div key={week.week_start} className="card-glass p-2.5">
              <p className="text-text-hi text-xs font-semibold mb-1">שבוע {formatDate(week.week_start)}</p>
              {week.sessions.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-text-mid py-0.5">
                  <span dir="ltr" className="tabular-nums">{s.volume_kg}kg נפח</span>
                  <span>{s.sets_completed} סטים</span>
                  <span>{formatDate(s.date)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ExerciseMediaModal({ name, animationWebpUrl, thumbnailPngUrl, tips, onClose }) {
  const [playing, setPlaying] = useState(true)
  const [tab, setTab] = useState('demo') // 'demo' | 'tips' | 'history'
  const supportsImageDecoder = typeof window !== 'undefined' && 'ImageDecoder' in window

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="card-glass w-full max-w-sm p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-text-hi font-bold text-lg truncate">{name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-text-mid hover:text-text-hi transition p-1 shrink-0"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 bg-white/4 border border-line rounded-full p-1 w-fit">
          {[{ key: 'demo', label: 'הדגמה' }, { key: 'tips', label: 'טיפים' }, { key: 'history', label: 'היסטוריה' }].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                tab === t.key ? 'bg-volt text-ink' : 'text-text-mid hover:text-text-hi'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'demo' ? (
          <>
            <div className="rounded-elem overflow-hidden bg-white/4">
              {supportsImageDecoder ? (
                <CrossfadeCanvas src={animationWebpUrl} playing={playing} />
              ) : (
                // Fallback: native <img> at real (unslowed, hard-cut) speed --
                // no ImageDecoder available means no way to control timing or
                // cross-fade. Always shows a working demo, just not smoothed
                // there. The existing pause trick (swap to the static
                // thumbnail) still works since it doesn't depend on ImageDecoder.
                <img
                  src={playing ? animationWebpUrl : thumbnailPngUrl}
                  alt={name}
                  className="w-full h-64 object-contain"
                />
              )}
            </div>

            <button
              type="button"
              onClick={() => setPlaying(p => !p)}
              className="btn-volt w-full py-2 text-sm inline-flex items-center justify-center gap-1.5"
            >
              {playing ? <><Pause className="w-4 h-4" /> השהה</> : <><Play className="w-4 h-4" /> נגן</>}
            </button>
          </>
        ) : tab === 'tips' ? (
          <TipsPanel name={name} thumbnailPngUrl={thumbnailPngUrl} tips={tips} />
        ) : (
          <HistoryPanel name={name} />
        )}
      </div>
    </div>
  )
}
