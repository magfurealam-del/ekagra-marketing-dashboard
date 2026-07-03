'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BucketBadge from '@/components/dashboard/BucketBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type BucketRow = {
  campaign_bucket: string
  spend_usd: string | number
  crm_leads: number
  appointments_booked: number
  appointments_attended: number
  revenue_bdt: string | number
  cost_per_lead_usd: string | number | null
  cost_per_attended_usd: string | number | null
}

function budgetCall(r: BucketRow): { label: string; tone: 'good' | 'bad' | 'warn' | 'default' } {
  const spend = n(r.spend_usd)
  const roas = spend > 0 ? n(r.revenue_bdt) / spend : null
  if (spend < 50 || r.crm_leads < 5) return { label: 'Needs more data', tone: 'default' }
  if (roas !== null && roas > 50 && r.appointments_attended > 5) return { label: 'Increase budget', tone: 'good' }
  if (roas !== null && roas > 10) return { label: 'Maintain budget', tone: 'default' }
  if (r.appointments_attended === 0 && spend > 100) return { label: 'Pause', tone: 'bad' }
  return { label: 'Reduce budget', tone: 'warn' }
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<BucketRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('vw_marketing_executive_summary').select('*').order('spend_usd', { ascending: false })
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data as BucketRow[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Booked</th>
              <th className="px-3 py-2 text-right">Attended</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Cost/Lead</th>
              <th className="px-3 py-2 text-right">Cost/Attended</th>
              <th className="px-3 py-2 text-right">ROAS</th>
              <th className="px-3 py-2">Budget call</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const spend = n(r.spend_usd)
              const revenue = n(r.revenue_bdt)
              const roas = spend > 0 ? revenue / spend : null
              const call = budgetCall(r)
              return (
                <tr key={r.campaign_bucket}>
                  <td className="px-3 py-2"><BucketBadge bucket={r.campaign_bucket} /></td>
                  <td className="px-3 py-2 text-right">${spend.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right">{r.crm_leads}</td>
                  <td className="px-3 py-2 text-right">{r.appointments_booked}</td>
                  <td className="px-3 py-2 text-right">{r.appointments_attended}</td>
                  <td className="px-3 py-2 text-right">৳{revenue.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.cost_per_lead_usd ? `$${n(r.cost_per_lead_usd).toFixed(1)}` : '—'}</td>
                  <td className="px-3 py-2 text-right">{r.cost_per_attended_usd ? `$${n(r.cost_per_attended_usd).toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2 text-right">{roas !== null ? roas.toFixed(1) + 'x' : '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        call.tone === 'good'
                          ? 'bg-emerald-100 text-emerald-700'
                          : call.tone === 'bad'
                            ? 'bg-rose-100 text-rose-700'
                            : call.tone === 'warn'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {call.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
