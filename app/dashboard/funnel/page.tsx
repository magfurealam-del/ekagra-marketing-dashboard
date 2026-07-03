'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BucketBadge from '@/components/dashboard/BucketBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'

type FunnelRow = {
  date: string
  campaign_bucket: string
  spend_usd: string | number
  impressions: number
  clicks: number
  meta_conversations: number
  crm_leads: number
  appointments_booked: number
  appointments_attended: number
  revenue_bdt: string | number
}

const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v))

function diagnose(agg: {
  clicks: number
  meta_conversations: number
  crm_leads: number
  appointments_booked: number
  appointments_attended: number
  revenue_bdt: number
}) {
  const notes: string[] = []
  if (agg.clicks > 0 && agg.meta_conversations / Math.max(agg.clicks, 1) < 0.05) notes.push('High clicks, low conversations — possible message/CTA friction')
  if (agg.meta_conversations > 0 && agg.crm_leads / Math.max(agg.meta_conversations, 1) < 0.3) notes.push('Conversations not converting to CRM leads — check capture process')
  if (agg.crm_leads > 0 && agg.appointments_booked / agg.crm_leads < 0.2) notes.push('Leads not converting to bookings — call center/script issue')
  if (agg.appointments_booked > 0 && agg.appointments_attended / agg.appointments_booked < 0.3) notes.push('Bookings not converting to attendance — reminder/location/trust issue')
  if (agg.appointments_attended > 0 && agg.revenue_bdt === 0) notes.push('Attendance without revenue — check invoice linkage or package/service issue')
  return notes
}

export default function FunnelPage() {
  const [rows, setRows] = useState<FunnelRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data, error } = await supabase
        .from('vw_funnel_by_bucket')
        .select('*')
        .gte('date', since.toISOString().slice(0, 10))
        .order('date', { ascending: false })
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data as FunnelRow[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  const byBucket = new Map<string, ReturnType<typeof emptyAgg>>()
  function emptyAgg() {
    return { spend_usd: 0, impressions: 0, clicks: 0, meta_conversations: 0, crm_leads: 0, appointments_booked: 0, appointments_attended: 0, revenue_bdt: 0 }
  }
  for (const r of rows) {
    const agg = byBucket.get(r.campaign_bucket) ?? emptyAgg()
    agg.spend_usd += n(r.spend_usd)
    agg.impressions += r.impressions
    agg.clicks += r.clicks
    agg.meta_conversations += r.meta_conversations
    agg.crm_leads += r.crm_leads
    agg.appointments_booked += r.appointments_booked
    agg.appointments_attended += r.appointments_attended
    agg.revenue_bdt += n(r.revenue_bdt)
    byBucket.set(r.campaign_bucket, agg)
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">Last 30 days, aggregated by campaign bucket.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Conversations</th>
              <th className="px-3 py-2 text-right">CRM Leads</th>
              <th className="px-3 py-2 text-right">Booked</th>
              <th className="px-3 py-2 text-right">Attended</th>
              <th className="px-3 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...byBucket.entries()].map(([bucket, agg]) => (
              <tr key={bucket}>
                <td className="px-3 py-2"><BucketBadge bucket={bucket} /></td>
                <td className="px-3 py-2 text-right">${agg.spend_usd.toFixed(0)}</td>
                <td className="px-3 py-2 text-right">{agg.meta_conversations}</td>
                <td className="px-3 py-2 text-right">{agg.crm_leads}</td>
                <td className="px-3 py-2 text-right">{agg.appointments_booked}</td>
                <td className="px-3 py-2 text-right">{agg.appointments_attended}</td>
                <td className="px-3 py-2 text-right">৳{agg.revenue_bdt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3">
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
      </div>
    </div>
  )
}
