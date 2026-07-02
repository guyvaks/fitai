export default function MetricCard({ title, value, unit, subtitle, color = "text-accent-blue" }) {
  return (
    <div className="bg-white border border-light-border rounded-card p-5 flex flex-col gap-2 shadow-sm">
      <span className="text-dark-text-muted text-sm">{title}</span>
      <div className="flex items-end gap-1">
        <span className={`text-3xl font-bold ${color}`}>{value}</span>
        {unit && <span className="text-dark-text-muted text-sm mb-1">{unit}</span>}
      </div>
      {subtitle && <span className="text-dark-text-muted text-xs">{subtitle}</span>}
    </div>
  );
}
