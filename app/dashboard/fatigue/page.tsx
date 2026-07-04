'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type Row = {
  date: string
  meta_ad_id: string
  meta_ad_name: string | null
  meta_campaign_name: string | null
  frequency: string | number | null
  conversations: number
  spend_bdt: string | number
  spend_usd: string | number
}

type Agg = {
  label: string
  days: { date: string; conversations: number; frequency: number | null }[]
  spendBdt: number
  spendUsd: number
}

function fatigueStatus(agg: Agg): { label: string; tone: 'good' | 'bad' | 'warn' | 'default' } {
  const sorted = [...agg.days].sort((a, b) => a.date.localeCompare(b.date))
  const latestFreq = sorted[sorted.length - 1]?.frequency
  if (sorted.length < 6 || latestFreq == null) return { label: 'Needs more data', tone: 'default' }

  const half = Math.floor(sorted.length / 2)
  const firstHalf = sorted.slice(0, half)
  const secondHalf = sorted.slice(half)
  const avgConvFirst = firstHalf.reduce((s, d) => s + d.conversations, 0) / firstHalf.length
  const avgConvSecond = secondHalf.reduce((s, d) => s + d.conversations, 0) / secondHalf.length
  const convDrop = avgConvFirst > 0 ? (avgConvFirst - avgConvSecond) / avgConvFirst : 0

  if (latestFreq >= 4 && convDrop > 0.3) return { label: 'Fatigued — refresh creative', tone: 'bad' }
  if (latestFreq >= 3 && convDrop > 0.15) return { label: 'Early fatigue signs', tone: 'warn' }
  if (latestFreq < 2) return { label: 'Fresh', tone: 'good' }
  return { label: 'Stable', tone: 'default' }
}

export default function FatiguePage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data, error } = await supabase
        .from('marketing_daily_spend')
        .select('date, meta_ad_id, meta_ad_name, meta_campaign_name, frequency, conversations, spend_bdt, spend_usd')
        .gte('date', since.toISOString().slice(0, 10))
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
  if (rows.length === 0) return <EmptyState message="No ad delivery data in the last 30 days." />

  const missingFrequency = rows.every((r) => r.frequency == null)
  const missingAdNames = rows.every((r) => !r.meta_ad_name)

  const byAd = new Map<string, Agg>()
  for (const r of rows) {
    const label = r.meta_ad_name || r.meta_campaign_name || r.meta_ad_id
    const agg = byAd.get(r.meta_ad_id) ?? { label, days: [], spendBdt: 0, spendUsd: 0 }
    agg.days.push({ date: r.date, conversations: r.conversations, frequency: r.frequency == null ? null : n(r.frequency) })
    agg.spendBdt += n(r.spend_bdt)
    agg.spendUsd += n(r.spend_usd)
    byAd.set(r.meta_ad_id, agg)
  }
  const ads = [...byAd.entries()].sort((a, b) => (b[1].spendBdt || b[1].spendUsd) - (a[1].spendBdt || a[1].spendUsd))

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Fatigue is flagged when frequency climbs while conversations decline over the last 30 days.</p>
      {(missingFrequency || missingAdNames) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {missingFrequency && missingAdNames
            ? 'Ad names and reach-frequency are not present in the Meta sync for this period, so fatigue can only be judged from spend/conversation trends until the sync backfills them.'
            : missingFrequency
              ? 'Reach-frequency is not present in the Meta sync for this period, so fatigue status defaults to "Needs more data" until it backfills.'
              : 'Ad names are not present in the Meta sync for this period — showing campaign name or ad ID instead.'}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Ad</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Latest frequency</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ads.map(([id, agg]) => {
              const sorted = [...agg.days].sort((a, b) => a.date.localeCompare(b.date))
              const latestFreq = sorted[sorted.length - 1]?.frequency
              const status = fatigueStatus(agg)
              const spendLabel = agg.spendBdt > 0 ? `৳${agg.spendBdt.toFixed(0)}` : agg.spendUsd > 0 ? `$${agg.spendUsd.toFixed(0)}` : '—'
              return (
                <tr key={id}>
                  <td className="max-w-xs truncate px-3 py-2" title={agg.label}>{agg.label}</td>
                  <td className="px-3 py-2 text-right">{spendLabel}</td>
                  <td className="px-3 py-2 text-right">{latestFreq != null ? `${latestFreq.toFixed(1)}x` : '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        status.tone === 'good'
                          ? 'bg-emerald-100 text-emerald-700'
                          : status.tone === 'bad'
                            ? 'bg-rose-100 text-rose-700'
                            : status.tone === 'warn'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {status.label}
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
