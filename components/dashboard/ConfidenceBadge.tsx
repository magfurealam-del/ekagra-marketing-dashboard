export default function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  const c = confidence ?? 0
  let label = 'Unknown'
  let cls = 'bg-slate-100 text-slate-600'
  if (c >= 0.85) {
    label = 'High confidence'
    cls = 'bg-emerald-100 text-emerald-700'
  } else if (c >= 0.6) {
    label = 'Moderate confidence'
    cls = 'bg-amber-100 text-amber-700'
  } else if (c > 0) {
    label = 'Low confidence'
    cls = 'bg-orange-100 text-orange-700'
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label} ({Math.round(c * 100)}%)
    </span>
  )
}
