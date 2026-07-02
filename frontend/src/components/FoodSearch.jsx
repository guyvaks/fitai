import { useState, useEffect, useRef } from 'react'
import { foodsAPI } from '../services/api'

const CATEGORY_COLOR = {
  'חלבונים':      'bg-blue-500/15 text-blue-400',
  'מוצרי חלב':   'bg-purple-500/15 text-purple-400',
  'פחמימות':      'bg-yellow-500/15 text-yellow-400',
  'ירקות':        'bg-green-500/15 text-green-400',
  'פירות':        'bg-orange-500/15 text-orange-400',
  'שומנים':       'bg-red-500/15 text-red-400',
  'חטיפים בריאים':'bg-teal-500/15 text-teal-400',
}

const CATEGORIES = [
  'כל הקטגוריות',
  'חלבונים',
  'פחמימות',
  'ירקות',
  'פירות',
  'מוצרי חלב',
  'שומנים',
  'חטיפים בריאים',
]

// ─── Food Search + Grid ───────────────────────────────────────────────────────
export default function FoodSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('כל הקטגוריות')
  const [allFoods, setAllFoods] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  // Load all foods on mount
  useEffect(() => {
    foodsAPI.search('').then(r => setAllFoods(r.data)).catch(() => {})
  }, [])

  // Re-fetch when category changes (server-side filter)
  const doSearch = (q, cat) => {
    clearTimeout(debounceRef.current)
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await foodsAPI.search(q, cat === 'כל הקטגוריות' ? '' : cat)
        setAllFoods(r.data)
      } catch {
        setAllFoods([])
      } finally {
        setSearching(false)
      }
    }, 200)
  }

  const handleQueryChange = (e) => {
    const val = e.target.value
    setQuery(val)
    doSearch(val, category)
  }

  const handleCategoryChange = (e) => {
    const cat = e.target.value
    setCategory(cat)
    doSearch(query, cat)
  }

  // Group results by category for grid display
  const grouped = allFoods.reduce((acc, food) => {
    if (!acc[food.category]) acc[food.category] = []
    acc[food.category].push(food)
    return acc
  }, {})

  const groupOrder = CATEGORIES.filter(c => c !== 'כל הקטגוריות' && grouped[c])

  return (
    <div className="col-span-2 space-y-3">
      <label className="text-text-muted text-xs block">חיפוש מאכל</label>

      {/* Category tabs + search */}
      <div className="space-y-2">
        {/* Category filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange({ target: { value: cat } })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                category === cat
                  ? 'bg-primary text-white'
                  : cat === 'כל הקטגוריות'
                    ? 'bg-background border border-slate-600 text-text-muted hover:text-text-main'
                    : `${CATEGORY_COLOR[cat] || 'bg-slate-700 text-text-muted'} opacity-70 hover:opacity-100`
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="חיפוש חופשי..."
            value={query}
            onChange={handleQueryChange}
            className="w-full bg-background border border-slate-700 rounded-lg px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
            autoComplete="off"
          />
          {searching && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">⏳</span>
          )}
        </div>
      </div>

      {/* Foods grid — grouped by category */}
      <div className="space-y-4 max-h-72 overflow-y-auto pl-1">
        {groupOrder.length === 0 && !searching && (
          <p className="text-text-muted text-sm text-center py-3">לא נמצאו מוצרים</p>
        )}
        {groupOrder.map(cat => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[cat] || 'bg-slate-700 text-text-muted'}`}>
                {cat}
              </span>
              <span className="text-text-muted text-xs">{grouped[cat].length} מוצרים</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped[cat].map(food => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => onSelect(food)}
                  className="bg-background hover:bg-primary/10 hover:border-primary/40 border border-slate-700/50 rounded-lg px-3 py-2 text-right transition-all group"
                >
                  <p className="text-text-main text-xs font-medium leading-tight group-hover:text-primary transition-colors truncate">{food.name}</p>
                  <p className="text-text-muted text-xs mt-0.5">{food.calories} קק״ל · ח׳ {food.protein}g</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export { CATEGORY_COLOR }
