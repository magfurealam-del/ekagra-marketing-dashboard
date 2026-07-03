'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BucketBadge from '@/components/dashboard/BucketBadge'
import AttributionBadge from '@/components/dashboard/AttributionBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type AdRow = {
  meta_ad_id: string
  meta_ad_name: string
  campaign_bucket: string
  spend_usd: string | number
  clicks: number
  conversations: number
  ctr_pct: string | number | null
  cpr_usd: string | number | null
  best_available_attribution: string | null
}

type Agg = {
  meta_ad_id: string
  meta_ad_name: string
  campaign_bucket: string
  spend: number
  clicks: number
  conversations: number
  attribution: string | null
  days: number
}

function labelFor(agg: Agg): { label: string; tone: 'good' | 'bad' | 'warn' | 'default' } {
  if (agg.spend < 20 || agg.days < 3) return { label: 'Insufficient data', tone: 'default' }
  if (agg.attribution === 'unknown' || !agg.attribution) return { label: 'Attribution too weak', tone: 'warn' }
  const cpr = agg.conversations > 0 ? agg.spend / agg.conversations : null
  if (cpr !== null && cpr < 1) return { label: 'Scale', tone: 'good' }
  if (cpr !== null && cpr < 3) return { label: 'Watch', tone: 'default' }
  if (agg.spend > 50 && agg.conversations < 5) return { label: 'Pause', tone: 'bad' }
  return { label: 'Refresh', tone: 'warn' }
}

export default function AdsPage() {
  const [rows, setRows] = useState<AdRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data, error } = await supabase
        .from('vw_ad_performance_with_crm')
        .select('*')
        .gte('date', since.toISOString().slice(0, 10))
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data as AdRow[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState />

  const byAd = new Map<string, Agg>()
  for (const r of rows) {
    const agg = byAd.get(r.meta_ad_id) ?? {
      meta_ad_id: r.meta_ad_id,
      meta_ad_name: r.meta_ad_name,
      campaign_bucket: r.campaign_bucket,
      spend: 0,
      clicks: 0,
      conversations: 0,
      attribution: r.best_available_attribution,
      days: 0,
    }
    agg.spend += n(r.spend_usd)
    agg.clicks += r.clicks
    agg.conversations += r.conversations
    agg.days += 1
    byAd.set(r.meta_ad_id, agg)
  }
  const ads = [...byAd.values()].sort((a, b) => b.spend - a.spend)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Last 30 days, aggregated per ad. Confidence reflects attribution quality of the underlying campaign bucket, not per-ad exactness.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Ad</th>
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">Clicks</th>
              <th className="px-3 py-2 text-right">Conversations</th>
              <th className="px-3 py-2 text-right">Cost/Conv.</th>
              <th className="px-3 py-2">Attribution</th>
              <th className="px-3 py-2">Label</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ads.map((a) => {
              const cpr = a.conversations > 0 ? a.spend / a.conversations : null
              const rec = labelFor(a)
              return (
                <tr key={a.meta_ad_id}>
                  <td className="max-w-xs truncate px-3 py-2" title={a.meta_ad_name}>{a.meta_ad_name}</td>
                  <td className="px-3 py-2"><BucketBadge bucket={a.campaign_bucket} /></td>
                  <td className="px-3 py-2 text-right">${a.spend.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right">{a.clicks}</td>
                  <td className="px-3 py-2 text-right">{a.conversations}</td>
                  <td className="px-3 py-2 text-right">{cpr !== null ? `$${cpr.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2"><AttributionBadge level={a.attribution} /></td>
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
