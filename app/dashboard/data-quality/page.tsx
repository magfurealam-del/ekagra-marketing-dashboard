'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import MetricCard from '@/components/dashboard/MetricCard'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'

type DQ = {
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
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function score(dq: DQ) {
  const metaSync = dq.last_meta_sync && Date.now() - new Date(dq.last_meta_sync).getTime() < 48 * 3_600_000 ? 100 : 40
  const crmCompleteness = Math.max(0, 100 - dq.leads_missing_phone)
  const attribution = Math.round(dq.exact_attribution_pct + dq.bucket_attribution_pct)
  const apptLinking = dq.appointments_unlinked === 0 ? 100 : Math.max(0, 100 - dq.appointments_unlinked * 5)
  const revenueLinking = dq.attended_without_revenue === 0 ? 100 : Math.max(0, 100 - dq.attended_without_revenue)
  const overall = Math.round((metaSync + crmCompleteness + attribution + apptLinking + revenueLinking) / 5)
  return { metaSync, crmCompleteness, attribution, apptLinking, revenueLinking, overall }
}

export default function DataQualityPage() {
  const [dq, setDq] = useState<DQ | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('vw_marketing_data_quality').select('*').single()
      if (cancelled) return
      if (error) setError(error.message)
      else setDq(data as DQ)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!dq) return <LoadingState />

  const s = score(dq)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard label="Last Meta sync" value={timeAgo(dq.last_meta_sync)} />
        <MetricCard label="Last CRM update" value={timeAgo(dq.last_crm_update)} />
        <MetricCard label="Last invoice import" value={timeAgo(dq.last_invoice_import)} />
        <MetricCard label="Unmapped campaigns" value={String(dq.unmapped_campaigns)} tone={dq.unmapped_campaigns > 0 ? 'warn' : 'good'} />
        <MetricCard label="Unknown-source leads" value={`${dq.unknown_source_pct}%`} sub={`${dq.unknown_source_leads} leads`} tone={dq.unknown_source_pct > 30 ? 'warn' : 'good'} />
        <MetricCard label="Leads missing phone" value={String(dq.leads_missing_phone)} tone={dq.leads_missing_phone > 0 ? 'warn' : 'good'} />
        <MetricCard label="Appointments unlinked" value={String(dq.appointments_unlinked)} tone={dq.appointments_unlinked > 0 ? 'warn' : 'good'} />
        <MetricCard label="Attended without revenue" value={String(dq.attended_without_revenue)} tone={dq.attended_without_revenue > 0 ? 'warn' : 'good'} />
        <MetricCard label="Exact + bucket attribution" value={`${(dq.exact_attribution_pct + dq.bucket_attribution_pct).toFixed(0)}%`} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Area</th>
              <th className="px-3 py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="px-3 py-2">Meta sync freshness</td><td className="px-3 py-2 text-right">{s.metaSync}</td></tr>
            <tr><td className="px-3 py-2">CRM completeness</td><td className="px-3 py-2 text-right">{s.crmCompleteness}</td></tr>
            <tr><td className="px-3 py-2">Attribution completeness</td><td className="px-3 py-2 text-right">{s.attribution}</td></tr>
            <tr><td className="px-3 py-2">Appointment linking</td><td className="px-3 py-2 text-right">{s.apptLinking}</td></tr>
            <tr><td className="px-3 py-2">Revenue linking</td><td className="px-3 py-2 text-right">{s.revenueLinking}</td></tr>
            <tr className="font-semibold"><td className="px-3 py-2">Overall trust score</td><td className="px-3 py-2 text-right">{s.overall}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
