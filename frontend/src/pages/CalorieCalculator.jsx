import { useState } from 'react'
import { nutritionAPI } from '../services/api'
import CalorieCalculatorPanel from '../components/CalorieCalculatorPanel'
import { Calculator, Sunrise, Sun, Moon, Apple } from 'lucide-react'

const MEAL_TYPES = [
  { key: 'breakfast', label: 'בוקר', Icon: Sunrise },
  { key: 'lunch', label: 'צהריים', Icon: Sun },
  { key: 'dinner', label: 'ערב', Icon: Moon },
  { key: 'snack', label: 'ביניים', Icon: Apple },
]

function toIso(date) {
  return date.toISOString().split('T')[0]
}

export default function CalorieCalculator() {
  const [mealType, setMealType] = useState('breakfast')
  const [error, setError] = useState(null)
  const [lastAdded, setLastAdded] = useState(null)

  const handleAddItem = async (item) => {
    setError(null)
    setLastAdded(null)
    try {
      await nutritionAPI.logFood({
        date: toIso(new Date()),
        meal_type: mealType,
        food_name: item.name,
        quantity_g: item.qty_g,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
      })
      setLastAdded(item.name)
    } catch (e) {
      setError(e.response?.data?.detail || 'שגיאה בהוספה ליומן')
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3 anim-rise">
        <span className="w-10 h-10 rounded-xl bg-volt-soft text-volt flex items-center justify-center shrink-0">
          <Calculator className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-3xl font-extrabold text-text-hi tracking-tight">מחשבון קלוריות</h2>
          <p className="text-text-mid text-sm">הזן שם מאכל או צלם/העלה תמונה — נחשב עבורך קלוריות ומאקרו</p>
        </div>
      </div>

      <div className="card-glass p-5 space-y-4 anim-rise anim-d1">
        <div>
          <label className="text-text-mid text-xs mb-2 block">הוסף ליומן תחת ארוחה</label>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map(mt => (
              <button
                key={mt.key}
                type="button"
                onClick={() => setMealType(mt.key)}
                className={`px-3 py-1.5 rounded-elem text-xs font-medium transition inline-flex items-center gap-1.5 ${
                  mealType === mt.key
                    ? 'bg-volt text-ink'
                    : 'bg-white/4 border border-line text-text-mid hover:text-text-hi'
                }`}
              >
                <mt.Icon className="w-3.5 h-3.5" /> {mt.label}
              </button>
            ))}
          </div>
        </div>

        {lastAdded && (
          <div className="bg-volt-soft border border-volt/25 rounded-elem p-3 text-volt text-sm">
            "{lastAdded}" נוסף ליומן האכילה
          </div>
        )}
        {error && (
          <div className="bg-coral-soft border border-coral/30 rounded-elem p-3 text-coral text-sm">{error}</div>
        )}

        <CalorieCalculatorPanel onAddItem={handleAddItem} />
      </div>
    </div>
  )
}
