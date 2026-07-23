import { useState, useEffect, useRef } from 'react'
import { foodMasterAPI } from '../services/api'
import { X, Loader2, Check } from 'lucide-react'

const CATEGORIES = [
  'חלבונים',
  'מוצרי חלב',
  'פחמימות',
  'ירקות',
  'פירות',
  'שומנים',
  'חטיפים בריאים',
]

// food_master-shaped item ({canonical_name_he, calories_per_100g, ...}) -> the
// shape FoodSearch's results (and FoodLog/ManualPlanModal's onSelect) expect
// ({id, name, calories, protein, carbs, fat, category}).
function toSearchResultShape(foodMasterItem) {
  return {
    id: foodMasterItem.id,
    name: foodMasterItem.canonical_name_he,
    calories: foodMasterItem.calories_per_100g,
    protein: foodMasterItem.protein_per_100g,
    carbs: foodMasterItem.carbs_per_100g,
    fat: foodMasterItem.fat_per_100g,
    category: foodMasterItem.category,
  }
}

const emptyForm = {
  nameEn: '',
  category: CATEGORIES[0],
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
}

export default function AddFoodModal({ open, onClose, initialNameHe, onSelect }) {
  const [nameHe, setNameHe] = useState(initialNameHe || '')
  const [form, setForm] = useState(emptyForm)
  const [stage, setStage] = useState('similar') // 'similar' | 'form' | 'success'
  const [similarMatches, setSimilarMatches] = useState([])
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [duplicateCandidate, setDuplicateCandidate] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setNameHe(initialNameHe || '')
    setForm(emptyForm)
    setStage('similar')
    setSimilarMatches([])
    setError(null)
    setDuplicateCandidate(null)
    runCheckSimilar(initialNameHe || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const runCheckSimilar = (value) => {
    clearTimeout(debounceRef.current)
    const trimmed = (value || '').trim()
    if (!trimmed) {
      setSimilarMatches([])
      setStage('form')
      return
    }
    setChecking(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await foodMasterAPI.checkSimilar(trimmed)
        setSimilarMatches(data)
        setStage(data.length > 0 ? 'similar' : 'form')
      } catch {
        setSimilarMatches([])
        setStage('form')
      } finally {
        setChecking(false)
      }
    }, 200)
  }

  const handleNameHeChange = (e) => {
    const val = e.target.value
    setNameHe(val)
    if (stage !== 'form' || similarMatches.length > 0) {
      runCheckSimilar(val)
    }
  }

  const handleUseMatch = (match) => {
    onSelect(toSearchResultShape(match))
    onClose()
  }

  const handleUseDuplicate = () => {
    onSelect(toSearchResultShape(duplicateCandidate))
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setDuplicateCandidate(null)
    setSubmitting(true)
    try {
      await foodMasterAPI.suggest({
        canonical_name_he: nameHe.trim(),
        canonical_name_en: form.nameEn.trim() || null,
        category: form.category,
        calories_per_100g: parseFloat(form.calories),
        protein_per_100g: parseFloat(form.protein),
        carbs_per_100g: parseFloat(form.carbs),
        fat_per_100g: parseFloat(form.fat),
        fiber_per_100g: form.fiber ? parseFloat(form.fiber) : null,
      })
      setStage('success')
    } catch (err) {
      if (err.response?.status === 409) {
        const detail = err.response.data.detail
        setDuplicateCandidate({
          id: detail.existing_id,
          canonical_name_he: detail.existing_name_he,
          category: detail.category,
          calories_per_100g: detail.calories_per_100g,
          protein_per_100g: detail.protein_per_100g,
          carbs_per_100g: detail.carbs_per_100g,
          fat_per_100g: detail.fat_per_100g,
        })
        setError('כבר קיים מוצר עם שם דומה במערכת')
      } else {
        setError('שגיאה בשליחת המוצר, נסה שוב')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-surface-2 border border-line-strong rounded-card w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl anim-rise">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-hi">הוספת מוצר חדש</h3>
          <button onClick={onClose} className="text-text-mid hover:text-text-hi transition p-1" aria-label="סגור">
            <X className="w-5 h-5" />
          </button>
        </div>

        {stage === 'success' && (
          <div className="space-y-4">
            <div className="bg-volt-soft border border-volt/30 rounded-card p-3 text-volt text-sm flex items-start gap-2">
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              <span>המוצר נשלח לאישור מנהל — הוא לא יופיע בחיפוש עד לאישור.</span>
            </div>
            <button type="button" onClick={onClose} className="btn-volt w-full">סגור</button>
          </div>
        )}

        {stage !== 'success' && (
          <>
            <div>
              <label className="text-text-mid text-xs block mb-1">שם המוצר (עברית)</label>
              <input
                type="text"
                value={nameHe}
                onChange={handleNameHeChange}
                className="input-volt"
                placeholder="לדוגמה: עוף בגריל"
                autoComplete="off"
              />
              {checking && (
                <p className="text-text-mid text-xs mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> בודק מוצרים דומים...
                </p>
              )}
            </div>

            {stage === 'similar' && (
              <div className="space-y-2">
                <p className="text-text-hi text-sm font-medium">מצאנו מוצרים דומים — האם התכוונת לאחד מאלה?</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pl-1">
                  {similarMatches.map((match) => (
                    <div
                      key={match.id}
                      className="bg-white/4 border border-line rounded-elem px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-text-hi text-xs font-medium truncate">{match.canonical_name_he}</p>
                        <p className="text-text-mid text-xs mt-0.5">
                          <span dir="ltr">{match.calories_per_100g}</span> קק״ל · ח׳ <span dir="ltr">{match.protein_per_100g}g</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUseMatch(match)}
                        className="shrink-0 px-2.5 py-1 rounded-elem text-xs font-medium border border-volt/30 text-volt hover:bg-volt-soft transition"
                      >
                        השתמש בזה
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setStage('form')}
                  className="text-text-mid text-xs hover:text-text-hi transition underline"
                >
                  לא, זה מוצר אחר — הוסף בכל זאת
                </button>
              </div>
            )}

            {stage === 'form' && (
              <form onSubmit={handleSubmit} className="space-y-3">
                {error && (
                  <div className="bg-coral-soft border border-coral/30 rounded-card p-3 text-coral text-sm space-y-2">
                    <p>{error}</p>
                    {duplicateCandidate && (
                      <button
                        type="button"
                        onClick={handleUseDuplicate}
                        className="px-2.5 py-1 rounded-elem text-xs font-medium border border-volt/30 text-volt hover:bg-volt-soft transition"
                      >
                        השתמש במוצר הקיים: {duplicateCandidate.canonical_name_he}
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-text-mid text-xs block mb-1">שם באנגלית (אופציונלי)</label>
                  <input
                    type="text"
                    value={form.nameEn}
                    onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                    className="input-volt"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-text-mid text-xs block mb-1">קטגוריה</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="input-volt"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-text-mid text-xs block mb-1">קלוריות ל-100 גרם</label>
                    <input type="number" min="0" step="any" value={form.calories}
                      onChange={(e) => setForm({ ...form, calories: e.target.value })}
                      className="input-volt" required />
                  </div>
                  <div>
                    <label className="text-text-mid text-xs block mb-1">חלבון (גרם)</label>
                    <input type="number" min="0" step="any" value={form.protein}
                      onChange={(e) => setForm({ ...form, protein: e.target.value })}
                      className="input-volt" required />
                  </div>
                  <div>
                    <label className="text-text-mid text-xs block mb-1">פחמימות (גרם)</label>
                    <input type="number" min="0" step="any" value={form.carbs}
                      onChange={(e) => setForm({ ...form, carbs: e.target.value })}
                      className="input-volt" required />
                  </div>
                  <div>
                    <label className="text-text-mid text-xs block mb-1">שומן (גרם)</label>
                    <input type="number" min="0" step="any" value={form.fat}
                      onChange={(e) => setForm({ ...form, fat: e.target.value })}
                      className="input-volt" required />
                  </div>
                  <div>
                    <label className="text-text-mid text-xs block mb-1">סיבים (אופציונלי)</label>
                    <input type="number" min="0" step="any" value={form.fiber}
                      onChange={(e) => setForm({ ...form, fiber: e.target.value })}
                      className="input-volt" />
                  </div>
                </div>

                <button type="submit" disabled={submitting || !nameHe.trim()} className="btn-volt w-full disabled:opacity-40">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'שלח לאישור מנהל'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
