export default function MetricCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'good' | 'bad' | 'warn'
}) {
  const toneClass = {
    default: 'text-slate-900',
    good: 'text-emerald-600',
    bad: 'text-rose-600',
    warn: 'text-amber-600',
  }[tone]

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}
