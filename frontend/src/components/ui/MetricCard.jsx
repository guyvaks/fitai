export default function MetricCard({ title, value, unit, subtitle, color = "text-primary" }) {
  return (
    <div className="bg-surface rounded-card p-5 flex flex-col gap-2">
      <span className="text-text-muted text-sm">{title}</span>
      <div className="flex items-end gap-1">
        <span className={`text-3xl font-bold ${color}`}>{value}</span>
        {unit && <span className="text-text-muted text-sm mb-1">{unit}</span>}
      </div>
      {subtitle && <span className="text-text-muted text-xs">{subtitle}</span>}
    </div>
  );
}
