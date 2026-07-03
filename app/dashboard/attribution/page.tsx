'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import MetricCard from '@/components/dashboard/MetricCard'
import AttributionBadge from '@/components/dashboard/AttributionBadge'
import BucketBadge from '@/components/dashboard/BucketBadge'
import ConfidenceBadge from '@/components/dashboard/ConfidenceBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'

type LeadOutcome = {
  attribution_id: string
  lead_id: number
  lead_date: string | null
  campaign_bucket: string | null
  attribution_level: string | null
  attribution_confidence: string | number | null
  self_reported_source: string | null
  lead_category: string | null
  agent_name: string | null
  location: string | null
  appointment_status: string | null
  booked: boolean | null
  attended: boolean | null
  revenue_bdt: string | number | null
}

const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v))

const LEVELS = ['exact_ad', 'campaign', 'campaign_bucket', 'self_reported', 'date_lift', 'unknown']

export default function AttributionPage() {
  const [rows, setRows] = useState<LeadOutcome[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('vw_lead_outcomes')
        .select('*')
        .order('lead_date', { ascending: false })
        .limit(500)
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data as LeadOutcome[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  const total = rows.length
  const distribution = LEVELS.map((level) => ({
    level,
    count: rows.filter((r) => (r.attribution_level ?? 'unknown') === level).length,
  }))

  const unknownPct = ((distribution.find((d) => d.level === 'unknown')?.count ?? 0) / total) * 100

  return (
    <div className="space-y-6">
      {unknownPct > 30 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {unknownPct.toFixed(0)}% of leads have unknown source attribution — treat bucket-level conclusions with caution.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {distribution.map((d) => (
          <MetricCard
            key={d.level}
            label={d.level.replace('_', ' ')}
            value={`${((d.count / total) * 100).toFixed(0)}%`}
            sub={`${d.count} leads`}
          />
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Attribution</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2">Appointment</th>
              <th className="px-3 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 200).map((r) => (
              <tr key={r.attribution_id}>
                <td className="px-3 py-2">#{r.lead_id}</td>
                <td className="px-3 py-2">{r.lead_category ?? '—'}</td>
                <td className="px-3 py-2">{r.self_reported_source ?? '—'}</td>
                <td className="px-3 py-2"><AttributionBadge level={r.attribution_level} /></td>
                <td className="px-3 py-2"><ConfidenceBadge confidence={n(r.attribution_confidence)} /></td>
                <td className="px-3 py-2"><BucketBadge bucket={r.campaign_bucket} /></td>
                <td className="px-3 py-2">{r.appointment_status ?? '—'}</td>
                <td className="px-3 py-2 text-right">৳{n(r.revenue_bdt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
