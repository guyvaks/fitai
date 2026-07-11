import { useState, useRef, useEffect } from 'react'
import { nutritionAPI } from '../services/api'
import { Type, Image as ImageIcon, Camera, Upload, Loader2, Sparkles, Plus, Check, X, RefreshCw } from 'lucide-react'

function round1(n) {
  return Math.round(n * 10) / 10
}

// Shared calorie-calculator core: text/image input -> Claude-backed estimate -> editable results
// with linear recalculation by quantity. Used both as a modal (FoodLog) and inline (standalone page).
export default function CalorieCalculatorPanel({ onAddItem }) {
  const [mode, setMode] = useState('text') // 'text' | 'image'
  const [query, setQuery] = useState('')
  const [image, setImage] = useState(null) // { base64, mediaType, previewUrl }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [results, setResults] = useState([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => () => stopCamera(), [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  async function openCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCameraOpen(true)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 0)
    } catch {
      setError('לא ניתן לגשת למצלמה — בדוק הרשאות דפדפן')
    }
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setImage({ base64: dataUrl, mediaType: 'image/jpeg', previewUrl: dataUrl })
    stopCamera()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImage({ base64: reader.result, mediaType: file.type || 'image/jpeg', previewUrl: reader.result })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleCalculate() {
    setError(null)
    setResults([])
    if (mode === 'text' && !query.trim()) {
      setError('נא להזין שם מאכל')
      return
    }
    if (mode === 'image' && !image) {
      setError('נא להעלות או לצלם תמונה')
      return
    }
    setLoading(true)
    try {
      const payload = mode === 'text'
        ? { type: 'text', query: query.trim() }
        : { type: 'image', image_base64: image.base64, image_media_type: image.mediaType }
      const r = await nutritionAPI.calculateCalories(payload)
      const items = r.data.items || []
      if (items.length === 0) {
        setError('לא זוהה מזון — נסה ניסוח אחר או תמונה ברורה יותר')
      }
      setResults(items.map(it => ({
        name: it.name,
        source: it.source,
        baseQtyG: it.estimated_quantity_g,
        baseCalories: it.calories,
        baseProtein: it.protein_g,
        baseFat: it.fat_g,
        baseCarbs: it.carbs_g,
        qtyG: String(it.estimated_quantity_g),
        added: false,
      })))
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בחישוב הקלוריות')
    } finally {
      setLoading(false)
    }
  }

  function updateQty(idx, val) {
    setResults(rs => rs.map((r, i) => i === idx ? { ...r, qtyG: val } : r))
  }

  function computed(r) {
    const qty = Math.max(0, parseFloat(r.qtyG) || 0)
    const factor = r.baseQtyG > 0 ? qty / r.baseQtyG : 0
    return {
      calories: round1(r.baseCalories * factor),
      protein: round1(r.baseProtein * factor),
      carbs: round1(r.baseCarbs * factor),
      fat: round1(r.baseFat * factor),
    }
  }

  function handleAdd(idx) {
    const r = results[idx]
    const qty = parseFloat(r.qtyG) || 0
    if (qty <= 0) return
    const c = computed(r)
    onAddItem({
      name: r.name,
      qty_g: qty,
      calories: c.calories,
      protein: c.protein,
      carbs: c.carbs,
      fat: c.fat,
    })
    setResults(rs => rs.map((res, i) => i === idx ? { ...res, added: true } : res))
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setMode('text'); setError(null); setResults([]) }}
          className={`flex-1 px-3 py-2 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
            mode === 'text' ? 'bg-volt text-ink' : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
          }`}
        >
          <Type className="w-4 h-4" /> טקסט
        </button>
        <button
          type="button"
          onClick={() => { setMode('image'); setError(null); setResults([]) }}
          className={`flex-1 px-3 py-2 rounded-elem text-sm font-medium transition inline-flex items-center justify-center gap-1.5 ${
            mode === 'image' ? 'bg-volt text-ink' : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
          }`}
        >
          <ImageIcon className="w-4 h-4" /> תמונה
        </button>
      </div>

      {mode === 'text' ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCalculate()}
            placeholder="לדוגמה: חזה עוף, קרואסון שקדים..."
            className="input-volt flex-1"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {cameraOpen ? (
            <div className="space-y-2">
              <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-elem bg-black aspect-video object-cover" />
              <div className="flex gap-2">
                <button type="button" onClick={capturePhoto} className="btn-volt flex-1 py-2 text-sm inline-flex items-center justify-center gap-1.5">
                  <Camera className="w-4 h-4" /> צלם
                </button>
                <button type="button" onClick={stopCamera} className="px-4 py-2 rounded-elem text-sm font-medium border border-line text-text-mid hover:text-text-hi hover:bg-white/6 transition">
                  ביטול
                </button>
              </div>
            </div>
          ) : image ? (
            <div className="relative">
              <img src={image.previewUrl} alt="תצוגה מקדימה" className="w-full max-h-64 object-contain rounded-elem bg-white/4 border border-line" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute top-2 left-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition"
                aria-label="הסר תמונה"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={openCamera} className="flex-1 border border-line text-text-mid hover:text-volt hover:border-volt/40 rounded-elem py-6 text-sm font-medium transition flex flex-col items-center gap-1.5">
                <Camera className="w-5 h-5" /> צילום
              </button>
              <label className="flex-1 border border-line text-text-mid hover:text-volt hover:border-volt/40 rounded-elem py-6 text-sm font-medium transition flex flex-col items-center gap-1.5 cursor-pointer">
                <Upload className="w-5 h-5" /> העלאת תמונה
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-coral-soft border border-coral/30 rounded-elem p-3 text-coral text-sm">{error}</div>
      )}

      <button
        type="button"
        onClick={handleCalculate}
        disabled={loading}
        className="btn-volt w-full py-2.5 text-sm flex items-center justify-center gap-1.5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'מחשב...' : 'חשב ערכים תזונתיים'}
      </button>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => {
            const c = computed(r)
            return (
              <div key={i} className="bg-white/4 border border-line rounded-elem p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-text-hi font-medium text-sm">{r.name}</span>
                    {r.source === 'ai_estimate' ? (
                      <span className="text-xs bg-cyan-soft text-cyan px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> הערכת AI
                      </span>
                    ) : (
                      <span className="text-xs bg-volt-soft text-volt px-1.5 py-0.5 rounded font-medium">מאגר מדויק</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-text-mid text-xs">כמות (גרם)</label>
                    <input
                      type="number"
                      min="1"
                      value={r.qtyG}
                      onChange={e => updateQty(i, e.target.value)}
                      className="w-20 bg-white/6 border border-line-strong rounded-elem px-2 py-1 text-text-hi text-sm focus:outline-none focus:border-volt/60"
                    />
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-text-mid flex-wrap">
                  <span>קלוריות <span className="text-text-hi font-medium" dir="ltr">{c.calories}</span></span>
                  <span>חלבון <span className="text-text-hi font-medium" dir="ltr">{c.protein}g</span></span>
                  <span>פחמימות <span className="text-text-hi font-medium" dir="ltr">{c.carbs}g</span></span>
                  <span>שומן <span className="text-text-hi font-medium" dir="ltr">{c.fat}g</span></span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(i)}
                  disabled={r.added}
                  className={`w-full py-1.5 rounded-elem text-xs font-bold transition inline-flex items-center justify-center gap-1 ${
                    r.added ? 'bg-volt-soft text-volt cursor-default' : 'bg-volt text-ink hover:brightness-105 active:scale-95'
                  }`}
                >
                  {r.added ? <><Check className="w-3.5 h-3.5" /> נוסף ליומן</> : <><Plus className="w-3.5 h-3.5" /> הוסף ליומן</>}
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={handleCalculate}
            className="w-full text-text-mid hover:text-text-hi text-xs inline-flex items-center justify-center gap-1 py-1"
          >
            <RefreshCw className="w-3 h-3" /> חשב שוב
          </button>
        </div>
      )}
    </div>
  )
}
