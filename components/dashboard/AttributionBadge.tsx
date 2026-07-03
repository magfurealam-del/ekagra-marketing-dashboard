const LABELS: Record<string, string> = {
  exact_ad: 'Exact ad',
  campaign: 'Campaign',
  campaign_bucket: 'Bucket',
  self_reported: 'Self-reported',
  date_lift: 'Date/lift',
  unknown: 'Unknown',
}

const COLORS: Record<string, string> = {
  exact_ad: 'bg-emerald-100 text-emerald-700',
  campaign: 'bg-teal-100 text-teal-700',
  campaign_bucket: 'bg-sky-100 text-sky-700',
  self_reported: 'bg-amber-100 text-amber-700',
  date_lift: 'bg-orange-100 text-orange-700',
  unknown: 'bg-slate-100 text-slate-600',
}

export default function AttributionBadge({ level }: { level: string | null }) {
  const key = level ?? 'unknown'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[key] ?? COLORS.unknown}`}>
      {LABELS[key] ?? key}
    </span>
  )
}
