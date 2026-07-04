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
import { n } from '@/lib/format'

type LeadOutcome = {
  attribution_id: string
  lead_id: number
  lead_date: string | null
  campaign_bucket: string | null
  attribution_level: string | null
  attribution_confidence: string | number | null
  self_reported_source: string | null
  lead_category: string | null
  appointment_status: string | null
  revenue_bdt: string | number | null
}

type FunnelRow = {
  date: string
  campaign_bucket: string
  clicks: number
  meta_conversations: number
  crm_leads: number
  appointments_booked: number
  appointments_attended: number
  revenue_bdt: string | number
}

const LEVELS = ['exact_ad', 'campaign', 'campaign_bucket', 'self_reported', 'date_lift', 'unknown']

function diagnose(agg: { clicks: number; meta_conversations: number; crm_leads: number; appointments_booked: number; appointments_attended: number; revenue_bdt: number }) {
  const notes: string[] = []
  if (agg.clicks > 0 && agg.meta_conversations / Math.max(agg.clicks, 1) < 0.05) notes.push('High clicks, low conversations — possible message/CTA friction')
  if (agg.meta_conversations > 0 && agg.crm_leads / Math.max(agg.meta_conversations, 1) < 0.3) notes.push('Conversations not converting to CRM leads — check capture process')
  if (agg.crm_leads > 0 && agg.appointments_booked / agg.crm_leads < 0.2) notes.push('Leads not converting to bookings — call center/script issue')
  if (agg.appointments_booked > 0 && agg.appointments_attended / agg.appointments_booked < 0.3) notes.push('Bookings not converting to attendance — reminder/location/trust issue')
  if (agg.appointments_attended > 0 && agg.revenue_bdt === 0) notes.push('Attendance without revenue — check invoice linkage or package/service issue')
  return notes
}

export default function IntelligencePage() {
  const [leads, setLeads] = useState<LeadOutcome[] | null>(null)
  const [funnel, setFunnel] = useState<FunnelRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const [leadsRes, funnelRes] = await Promise.all([
        supabase.from('vw_lead_outcomes').select('*').order('lead_date', { ascending: false }).limit(500),
        supabase.from('vw_funnel_by_bucket').select('*').gte('date', since.toISOString().slice(0, 10)),
      ])
      if (cancelled) return
      if (leadsRes.error) setError(leadsRes.error.message)
      else setLeads(leadsRes.data as LeadOutcome[])
      if (!funnelRes.error) setFunnel(funnelRes.data as FunnelRow[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!leads) return <LoadingState />
  if (leads.length === 0) return <EmptyState />

  const total = leads.length
  const distribution = LEVELS.map((level) => ({
    level,
    count: leads.filter((r) => (r.attribution_level ?? 'unknown') === level).length,
  }))
  const unknownPct = ((distribution.find((d) => d.level === 'unknown')?.count ?? 0) / total) * 100

  const byBucket = new Map<string, { clicks: number; meta_conversations: number; crm_leads: number; appointments_booked: number; appointments_attended: number; revenue_bdt: number }>()
  for (const r of funnel ?? []) {
    const agg = byBucket.get(r.campaign_bucket) ?? { clicks: 0, meta_conversations: 0, crm_leads: 0, appointments_booked: 0, appointments_attended: 0, revenue_bdt: 0 }
    agg.clicks += r.clicks
    agg.meta_conversations += r.meta_conversations
    agg.crm_leads += r.crm_leads
    agg.appointments_booked += r.appointments_booked
    agg.appointments_attended += r.appointments_attended
    agg.revenue_bdt += n(r.revenue_bdt)
    byBucket.set(r.campaign_bucket, agg)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Attribution confidence</h2>
        {unknownPct > 30 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {unknownPct.toFixed(0)}% of leads have unknown source attribution — treat bucket-level conclusions with caution.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {distribution.map((d) => (
            <MetricCard key={d.level} label={d.level.replace('_', ' ')} value={`${((d.count / total) * 100).toFixed(0)}%`} sub={`${d.count} leads`} />
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
              {leads.slice(0, 100).map((r) => (
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
      </section>

      {funnel && funnel.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Funnel drop-off diagnostics (last 30 days)</h2>
          {[...byBucket.entries()].map(([bucket, agg]) => {
            const notes = diagnose(agg)
            if (notes.length === 0) return null
            return (
              <div key={bucket} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <div className="mb-1 font-medium"><BucketBadge bucket={bucket} /></div>
                <ul className="list-disc pl-5 text-amber-800">
                  {notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
