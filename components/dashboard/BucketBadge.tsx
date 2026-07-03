const LABELS: Record<string, string> = {
  wound: 'Wound (Type A)',
  screening: 'Screening (Type B)',
  awareness: 'Awareness (Type C)',
  retargeting: 'Retargeting (Type D)',
  unknown: 'Unknown',
}

const COLORS: Record<string, string> = {
  wound: 'bg-rose-100 text-rose-700',
  screening: 'bg-teal-100 text-teal-700',
  awareness: 'bg-indigo-100 text-indigo-700',
  retargeting: 'bg-purple-100 text-purple-700',
  unknown: 'bg-slate-100 text-slate-600',
}

export default function BucketBadge({ bucket }: { bucket: string | null }) {
  const key = bucket ?? 'unknown'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[key] ?? COLORS.unknown}`}>
      {LABELS[key] ?? key}
    </span>
  )
}
