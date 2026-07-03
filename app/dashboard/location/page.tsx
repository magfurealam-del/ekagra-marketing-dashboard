'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type Row = {
  location: string | null
  booked: boolean | null
  attended: boolean | null
  revenue_bdt: string | number | null
}

type Agg = { leads: number; booked: number; attended: number; revenue: number }

function insight(name: string, a: Agg): string | null {
  const showRate = a.booked > 0 ? a.attended / a.booked : 0
  if (a.leads >= 10 && showRate < 0.2) return 'Cheap/plentiful leads but poor attendance — likely a distance/logistics issue'
  if (a.revenue > 0 && a.leads > 0 && a.revenue / a.leads > 2000) return 'High revenue per lead — worth protecting or scaling spend here'
  if (showRate >= 0.5 && a.leads >= 5) return 'Strong show rate — good location to double down on'
  return null
}

export default function LocationPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('vw_lead_outcomes').select('location, booked, attended, revenue_bdt').limit(2000)
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

  const byLocation = new Map<string, Agg>()
  for (const r of rows) {
    const loc = r.location ?? 'Unknown'
    const a = byLocation.get(loc) ?? { leads: 0, booked: 0, attended: 0, revenue: 0 }
    a.leads += 1
    if (r.booked) a.booked += 1
    if (r.attended) a.attended += 1
    a.revenue += n(r.revenue_bdt)
    byLocation.set(loc, a)
  }
  const locations = [...byLocation.entries()].sort((a, b) => b[1].leads - a[1].leads).slice(0, 25)

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Booked</th>
              <th className="px-3 py-2 text-right">Attended</th>
              <th className="px-3 py-2 text-right">Show rate</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2">Insight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {locations.map(([loc, a]) => (
              <tr key={loc}>
                <td className="px-3 py-2">{loc}</td>
                <td className="px-3 py-2 text-right">{a.leads}</td>
                <td className="px-3 py-2 text-right">{a.booked}</td>
                <td className="px-3 py-2 text-right">{a.attended}</td>
                <td className="px-3 py-2 text-right">{a.booked ? ((a.attended / a.booked) * 100).toFixed(0) + '%' : '—'}</td>
                <td className="px-3 py-2 text-right">৳{a.revenue.toLocaleString()}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{insight(loc, a) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
