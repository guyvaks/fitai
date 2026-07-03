export default function BMIMeter({ bmi, category }) {
  // Range: 10–40, mapped to a 180° semicircle (left = underweight, right = obese)
  const MIN = 10;
  const MAX = 40;
  const clampedBmi = Math.min(Math.max(bmi, MIN), MAX);
  const angle = ((clampedBmi - MIN) / (MAX - MIN)) * 180;

  const categoryTextColor = {
    "תת משקל": "text-blue-600",
    "משקל תקין": "text-green-600",
    "עודף משקל": "text-yellow-600",
    "השמנה": "text-red-600",
  }[category] || "text-dark-text";

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 90;
  const strokeWidth = 16;

  // Needle endpoint: angle measured from the left end of the semicircle (180deg) to the right (0deg)
  const needleAngleRad = ((180 - angle) * Math.PI) / 180;
  const needleX = cx + (r - strokeWidth / 2) * Math.cos(needleAngleRad);
  const needleY = cy - (r - strokeWidth / 2) * Math.sin(needleAngleRad);

  return (
    <div className="w-full flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        <defs>
          <linearGradient id="bmiGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="35%" stopColor="#22C55E" />
            <stop offset="65%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
        </defs>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#bmiGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="#111827"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="6" fill="#111827" />
      </svg>
      <div className={`text-3xl font-bold -mt-2 ${categoryTextColor}`}>{bmi}</div>
      {category && <div className={`text-sm font-medium ${categoryTextColor}`}>{category}</div>}
      <div className="flex justify-between w-full max-w-[220px] mt-2 text-xs text-dark-text-muted">
        <span>תת משקל</span>
        <span>תקין</span>
        <span>עודף</span>
        <span>השמנה</span>
      </div>
    </div>
  );
}
