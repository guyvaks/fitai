import { useState, useEffect, useRef } from 'react'
import { foodsAPI } from '../services/api'
import { Loader2 } from 'lucide-react'
import AddFoodModal from './AddFoodModal'

const CATEGORY_COLOR = {
  'חלבונים':      'bg-cyan-soft text-cyan',
  'מוצרי חלב':   'bg-violet-soft text-violet',
  'פחמימות':      'bg-amber-soft text-amber',
  'ירקות':        'bg-volt-soft text-volt',
  'פירות':        'bg-orange-400/15 text-orange-300',
  'שומנים':       'bg-coral-soft text-coral',
  'חטיפים בריאים':'bg-teal-400/15 text-teal-300',
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
  const [showAddFood, setShowAddFood] = useState(false)
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
      <label className="text-text-mid text-xs block">חיפוש מאכל</label>

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
                  ? 'bg-volt text-ink'
                  : cat === 'כל הקטגוריות'
                    ? 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
                    : `${CATEGORY_COLOR[cat] || 'bg-white/6 text-text-mid'} opacity-70 hover:opacity-100`
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
            className="input-volt"
            autoComplete="off"
          />
          {searching && (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-text-mid w-3.5 h-3.5 animate-spin" />
          )}
        </div>
      </div>

      {/* Foods grid — grouped by category */}
      <div className="space-y-4 max-h-72 overflow-y-auto pl-1">
        {groupOrder.length === 0 && !searching && (
          <div className="text-center py-3 space-y-2">
            <p className="text-text-mid text-sm">לא נמצאו מוצרים</p>
            <button
              type="button"
              onClick={() => setShowAddFood(true)}
              className="px-3 py-1.5 rounded-elem text-sm font-medium border border-volt/30 text-volt hover:bg-volt-soft transition"
            >
              מוצר לא נמצא? הוסף חדש
            </button>
          </div>
        )}
        {groupOrder.map(cat => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLOR[cat] || 'bg-white/6 text-text-mid'}`}>
                {cat}
              </span>
              <span className="text-text-mid text-xs">{grouped[cat].length} מוצרים</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped[cat].map(food => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => onSelect(food)}
                  className="bg-white/4 hover:bg-volt-soft hover:border-volt/40 border border-line rounded-elem px-3 py-2 text-right transition-all group"
                >
                  <p className="text-text-hi text-xs font-medium leading-tight group-hover:text-volt transition-colors truncate">{food.name}</p>
                  <p className="text-text-mid text-xs mt-0.5"><span dir="ltr">{food.calories}</span> קק״ל · ח׳ <span dir="ltr">{food.protein}g</span></p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AddFoodModal
        open={showAddFood}
        onClose={() => setShowAddFood(false)}
        initialNameHe={query}
        onSelect={onSelect}
      />
    </div>
  )
}

export { CATEGORY_COLOR }
