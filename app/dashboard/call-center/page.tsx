'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BucketBadge from '@/components/dashboard/BucketBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type Row = {
  agent_name: string | null
  campaign_bucket: string
  leads_handled: number
  appointments_booked: number
  appointments_attended: number
  no_shows: number
  revenue_bdt: string | number
}

export default function CallCenterPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data, error } = await supabase.from('vw_call_center_marketing_outcomes').select('*').gte('date', since.toISOString().slice(0, 10))
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data as Row[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  const byAgent = new Map<string, { leads: number; booked: number; attended: number }>()
  const byBucket = new Map<string, { leads: number; booked: number; attended: number; revenue: number }>()
  for (const r of rows) {
    const agent = r.agent_name ?? 'Unassigned'
    const a = byAgent.get(agent) ?? { leads: 0, booked: 0, attended: 0 }
    a.leads += r.leads_handled
    a.booked += r.appointments_booked
    a.attended += r.appointments_attended
    byAgent.set(agent, a)

    const b = byBucket.get(r.campaign_bucket) ?? { leads: 0, booked: 0, attended: 0, revenue: 0 }
    b.leads += r.leads_handled
    b.booked += r.appointments_booked
    b.attended += r.appointments_attended
    b.revenue += n(r.revenue_bdt)
    byBucket.set(r.campaign_bucket, b)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Agent performance (last 30 days)</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2 text-right">Leads handled</th>
                <th className="px-3 py-2 text-right">Booked</th>
                <th className="px-3 py-2 text-right">Attended</th>
                <th className="px-3 py-2 text-right">Booking rate</th>
                <th className="px-3 py-2 text-right">Show rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...byAgent.entries()].sort((a, b) => b[1].leads - a[1].leads).map(([agent, a]) => (
                <tr key={agent}>
                  <td className="px-3 py-2">{agent}</td>
                  <td className="px-3 py-2 text-right">{a.leads}</td>
                  <td className="px-3 py-2 text-right">{a.booked}</td>
                  <td className="px-3 py-2 text-right">{a.attended}</td>
                  <td className="px-3 py-2 text-right">{a.leads ? ((a.booked / a.leads) * 100).toFixed(0) + '%' : '—'}</td>
                  <td className="px-3 py-2 text-right">{a.booked ? ((a.attended / a.booked) * 100).toFixed(0) + '%' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Marketing connection</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-2">Bucket</th>
                <th className="px-3 py-2 text-right">Leads</th>
                <th className="px-3 py-2 text-right">Booked</th>
                <th className="px-3 py-2 text-right">Attended</th>
                <th className="px-3 py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...byBucket.entries()].map(([bucket, b]) => (
                <tr key={bucket}>
                  <td className="px-3 py-2"><BucketBadge bucket={bucket} /></td>
                  <td className="px-3 py-2 text-right">{b.leads}</td>
                  <td className="px-3 py-2 text-right">{b.booked}</td>
                  <td className="px-3 py-2 text-right">{b.attended}</td>
                  <td className="px-3 py-2 text-right">৳{b.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
