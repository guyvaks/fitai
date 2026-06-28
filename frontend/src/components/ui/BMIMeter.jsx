export default function BMIMeter({ bmi, category }) {
  // Range: 10–40
  const MIN = 10;
  const MAX = 40;
  const clampedBmi = Math.min(Math.max(bmi, MIN), MAX);
  const percent = ((clampedBmi - MIN) / (MAX - MIN)) * 100;

  const categoryColor = {
    "תת משקל": "bg-blue-500 text-blue-400",
    "משקל תקין": "bg-green-500 text-green-400",
    "עודף משקל": "bg-yellow-500 text-yellow-400",
    "השמנה": "bg-red-500 text-red-400",
  };

  const badgeColor = categoryColor[category] || "bg-gray-500 text-gray-400";
  const textColor = badgeColor.split(" ")[1];

  return (
    <div className="w-full">
      {/* Marker */}
      <div className="relative h-6 mb-1">
        <div
          className="absolute transform -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${percent}%` }}
        >
          <span className={`text-xs font-bold ${textColor}`}>{bmi}</span>
          <div
            className="w-0 h-0"
            style={{
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "6px solid currentColor",
              color: "currentColor",
            }}
          />
        </div>
      </div>

      {/* Gradient bar */}
      <div
        className="h-3 rounded-full"
        style={{
          background: "linear-gradient(to left, #ef4444, #f97316, #eab308, #22c55e, #3b82f6)",
        }}
      />

      {/* Labels */}
      <div className="flex justify-between mt-1 text-xs text-text-muted">
        <span>תת משקל</span>
        <span>תקין</span>
        <span>עודף</span>
        <span>השמנה</span>
      </div>

      {/* Category badge */}
      {category && (
        <div className="mt-3 flex justify-center">
          <span className={`px-3 py-1 rounded-full text-sm font-medium text-white ${badgeColor.split(" ")[0]}`}>
            {category}
          </span>
        </div>
      )}
    </div>
  );
}
