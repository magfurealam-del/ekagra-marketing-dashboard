'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type Row = {
  lead_category: string | null
  booked: boolean | null
  attended: boolean | null
  attribution_confidence: string | number | null
  revenue_bdt: string | number | null
}

type Agg = { leads: number; booked: number; attended: number; revenue: number; confidenceSum: number }

export default function AudiencePage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('vw_lead_outcomes').select('lead_category, booked, attended, attribution_confidence, revenue_bdt').limit(2000)
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

  const bySegment = new Map<string, Agg>()
  for (const r of rows) {
    const seg = r.lead_category ?? 'other'
    const a = bySegment.get(seg) ?? { leads: 0, booked: 0, attended: 0, revenue: 0, confidenceSum: 0 }
    a.leads += 1
    if (r.booked) a.booked += 1
    if (r.attended) a.attended += 1
    a.revenue += n(r.revenue_bdt)
    a.confidenceSum += n(r.attribution_confidence)
    bySegment.set(seg, a)
  }
  const segments = [...bySegment.entries()].sort((a, b) => b[1].leads - a[1].leads)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Audience segments by lead category, with booking/attendance conversion and revenue.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Segment</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Booked</th>
              <th className="px-3 py-2 text-right">Attended</th>
              <th className="px-3 py-2 text-right">Booking rate</th>
              <th className="px-3 py-2 text-right">Show rate</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Avg. confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {segments.map(([seg, a]) => (
              <tr key={seg}>
                <td className="px-3 py-2 font-medium">{seg}</td>
                <td className="px-3 py-2 text-right">{a.leads}</td>
                <td className="px-3 py-2 text-right">{a.booked}</td>
                <td className="px-3 py-2 text-right">{a.attended}</td>
                <td className="px-3 py-2 text-right">{a.leads ? ((a.booked / a.leads) * 100).toFixed(0) + '%' : '—'}</td>
                <td className="px-3 py-2 text-right">{a.booked ? ((a.attended / a.booked) * 100).toFixed(0) + '%' : '—'}</td>
                <td className="px-3 py-2 text-right">৳{a.revenue.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{a.leads ? ((a.confidenceSum / a.leads) * 100).toFixed(0) + '%' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
