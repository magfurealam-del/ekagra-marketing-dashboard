type DataQuality = {
  last_meta_sync: string | null
  last_crm_update: string | null
  last_invoice_import: string | null
  unmapped_campaigns: number
  unknown_source_leads: number
  unknown_source_pct: number
  exact_attribution_pct: number
  bucket_attribution_pct: number
  leads_missing_phone: number
  appointments_unlinked: number
  attended_without_revenue: number
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function DataHealthBar({ dq }: { dq: DataQuality }) {
  const warn = dq.unknown_source_pct > 30 || dq.unmapped_campaigns > 0 || dq.attended_without_revenue > 0

  return (
    <div className={`rounded-lg border p-3 text-xs flex flex-wrap gap-x-6 gap-y-1 ${warn ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <span>Meta sync: <strong>{timeAgo(dq.last_meta_sync)}</strong></span>
      <span>CRM sync: <strong>{timeAgo(dq.last_crm_update)}</strong></span>
      <span>Invoice sync: <strong>{timeAgo(dq.last_invoice_import)}</strong></span>
      <span>Exact attribution: <strong>{dq.exact_attribution_pct}%</strong></span>
      <span>Bucket attribution: <strong>{dq.bucket_attribution_pct}%</strong></span>
      <span className={dq.unknown_source_pct > 30 ? 'text-amber-700 font-semibold' : ''}>
        Unknown-source leads: <strong>{dq.unknown_source_pct}%</strong>
      </span>
      {dq.unmapped_campaigns > 0 && (
        <span className="text-amber-700 font-semibold">{dq.unmapped_campaigns} unmapped campaign(s)</span>
      )}
    </div>
  )
}
