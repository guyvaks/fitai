import { useState, useEffect, useRef } from 'react'
import { foodsAPI } from '../services/api'

const CATEGORY_COLOR = {
  'חלבונים':      'bg-blue-50 text-blue-600',
  'מוצרי חלב':   'bg-purple-50 text-purple-600',
  'פחמימות':      'bg-yellow-50 text-yellow-600',
  'ירקות':        'bg-green-50 text-green-600',
  'פירות':        'bg-orange-50 text-orange-600',
  'שומנים':       'bg-red-50 text-red-600',
  'חטיפים בריאים':'bg-teal-50 text-teal-600',
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
      <label className="text-dark-text-muted text-xs block">חיפוש מאכל</label>

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
                  ? 'bg-accent-blue text-white'
                  : cat === 'כל הקטגוריות'
                    ? 'bg-white border border-light-border text-dark-text-muted hover:text-dark-text'
                    : `${CATEGORY_COLOR[cat] || 'bg-gray-100 text-dark-text-muted'} opacity-70 hover:opacity-100`
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
            className="w-full bg-white border border-light-border rounded-lg px-3 py-2 text-dark-text text-sm focus:outline-none focus:border-accent-blue"
            autoComplete="off"
          />
          {searching && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-text-muted text-xs">⏳</span>
          )}
        </div>
      </div>

      {/* Foods grid — grouped by category */}
      <div className="space-y-4 max-h-72 overflow-y-auto pl-1">
        {groupOrder.length === 0 && !searching && (
          <p className="text-dark-text-muted text-sm text-center py-3">לא נמצאו מוצרים</p>
        )}
        {groupOrder.map(cat => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[cat] || 'bg-gray-100 text-dark-text-muted'}`}>
                {cat}
              </span>
              <span className="text-dark-text-muted text-xs">{grouped[cat].length} מוצרים</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped[cat].map(food => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => onSelect(food)}
                  className="bg-white hover:bg-blue-50 hover:border-accent-blue/40 border border-light-border rounded-lg px-3 py-2 text-right transition-all group shadow-sm"
                >
                  <p className="text-dark-text text-xs font-medium leading-tight group-hover:text-accent-blue transition-colors truncate">{food.name}</p>
                  <p className="text-dark-text-muted text-xs mt-0.5">{food.calories} קק״ל · ח׳ {food.protein}g</p>
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
