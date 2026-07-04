'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import MetricCard from '@/components/dashboard/MetricCard'
import DataHealthBar from '@/components/dashboard/DataHealthBar'
import BucketBadge from '@/components/dashboard/BucketBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'

type BucketRow = {
  campaign_bucket: string
  internal_type_code: string
  spend_usd: string | number
  meta_conversations: number
  crm_leads: number
  appointments_booked: number
  appointments_attended: number
  no_shows: number
  revenue_bdt: string | number
  cost_per_lead_usd: string | number | null
  cost_per_booked_usd: string | number | null
  cost_per_attended_usd: string | number | null
  revenue_per_lead_bdt: string | number | null
  booking_rate: string | number | null
  show_rate: string | number | null
  attribution_confidence_avg: string | number | null
}

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

const n = (v: string | number | null | undefined) => (v == null ? 0 : Number(v))
const fmtMoney = (v: number, currency = '') => `${currency}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`

function recommend(row: BucketRow): { label: string; tone: 'good' | 'bad' | 'warn' | 'default'; reason: string } {
  const spend = n(row.spend_usd)
  const leads = row.crm_leads
  const attended = row.appointments_attended
  const showRate = n(row.show_rate)
  const bookingRate = n(row.booking_rate)
  const confidence = n(row.attribution_confidence_avg)

  if (spend < 50 || leads < 5) return { label: 'Needs more data', tone: 'default', reason: 'Insufficient spend/sample size' }
  if (attended === 0 && spend > 100) return { label: 'Pause', tone: 'bad', reason: 'Spend with zero attended patients' }
  if (leads > 20 && bookingRate < 0.2) return { label: 'Fix', tone: 'warn', reason: 'High leads but low booking rate' }
  if (bookingRate > 0.3 && showRate < 0.25) return { label: 'Fix', tone: 'warn', reason: 'Good bookings but low show rate' }
  if (confidence < 0.4 && leads > 10) return { label: 'Investigate', tone: 'warn', reason: 'High unknown/low attribution confidence' }
  if (showRate >= 0.3 && confidence >= 0.5 && attended >= 5) return { label: 'Scale', tone: 'good', reason: 'Healthy show rate with reasonable confidence' }
  return { label: 'Watch', tone: 'default', reason: 'Within normal range' }
}

export default function ExecutivePage() {
  const [rows, setRows] = useState<BucketRow[] | null>(null)
  const [dq, setDq] = useState<DataQuality | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [summaryRes, dqRes] = await Promise.all([
        supabase.from('vw_marketing_executive_summary').select('*').order('spend_usd', { ascending: false }),
        supabase.from('vw_marketing_data_quality').select('*').single(),
      ])
      if (cancelled) return
      if (summaryRes.error) setError(summaryRes.error.message)
      else setRows(summaryRes.data as BucketRow[])
      if (!dqRes.error) setDq(dqRes.data as DataQuality)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  const totalSpend = rows.reduce((s, r) => s + n(r.spend_usd), 0)
  const totalLeads = rows.reduce((s, r) => s + r.crm_leads, 0)
  const totalBooked = rows.reduce((s, r) => s + r.appointments_booked, 0)
  const totalAttended = rows.reduce((s, r) => s + r.appointments_attended, 0)
  const totalNoShow = rows.reduce((s, r) => s + r.no_shows, 0)
  const totalRevenue = rows.reduce((s, r) => s + n(r.revenue_bdt), 0)
  const costPerAttended = totalAttended ? totalSpend / totalAttended : null
  const showRate = totalBooked ? totalAttended / totalBooked : null

  return (
    <div className="space-y-6">
      {dq && <DataHealthBar dq={dq} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Total spend" value={`$${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <MetricCard label="CRM leads" value={totalLeads.toLocaleString()} />
        <MetricCard label="Booked" value={totalBooked.toLocaleString()} />
        <MetricCard label="Attended" value={totalAttended.toLocaleString()} tone="good" />
        <MetricCard label="No-shows" value={totalNoShow.toLocaleString()} tone={totalNoShow > 0 ? 'warn' : 'default'} />
        <MetricCard label="Revenue" value={fmtMoney(totalRevenue, '৳')} tone="good" />
        <MetricCard label="Cost / attended" value={costPerAttended ? `$${costPerAttended.toFixed(0)}` : '—'} />
        <MetricCard label="Show rate" value={showRate !== null ? fmtPct(showRate) : '—'} tone={showRate !== null && showRate < 0.3 ? 'warn' : 'good'} />
      </div>

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
              <th className="px-3 py-2 text-right">Cost/Attended</th>
              <th className="px-3 py-2 text-right">ROAS</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Recommendation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const rec = recommend(r)
              const spend = n(r.spend_usd)
              const revenue = n(r.revenue_bdt)
              const roas = spend > 0 ? revenue / spend : null
              return (
                <tr key={r.campaign_bucket}>
                  <td className="px-3 py-2"><BucketBadge bucket={r.campaign_bucket} /></td>
                  <td className="px-3 py-2 text-right">${spend.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right">{r.crm_leads}</td>
                  <td className="px-3 py-2 text-right">{r.appointments_booked}</td>
                  <td className="px-3 py-2 text-right">{r.appointments_attended}</td>
                  <td className="px-3 py-2 text-right">৳{revenue.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.cost_per_attended_usd ? `$${n(r.cost_per_attended_usd).toFixed(0)}` : '—'}</td>
                  <td className="px-3 py-2 text-right">{roas !== null ? roas.toFixed(1) + 'x' : '—'}</td>
                  <td className="px-3 py-2">{fmtPct(n(r.attribution_confidence_avg))}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        rec.tone === 'good'
                          ? 'bg-emerald-100 text-emerald-700'
                          : rec.tone === 'bad'
                            ? 'bg-rose-100 text-rose-700'
                            : rec.tone === 'warn'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                      title={rec.reason}
                    >
                      {rec.label}
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
