'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type SpendRow = {
  meta_ad_id: string
  meta_ad_name: string
  spend_bdt: string | number
  conversations: number
  video_3s_views: number
  video_50_views: number
}

type Agg = { meta_ad_name: string; spend: number; conversations: number; v3s: number; v50: number }

function diagnose(a: Agg): string {
  const retention = a.v3s > 0 ? a.v50 / a.v3s : 0
  if (a.v3s > 1000 && a.conversations < 5) return 'High views, low leads — hook is working but offer/CTA may not land'
  if (retention > 0.3 && a.conversations < 5) return 'Good retention, poor CTA — consider a stronger call to action'
  if (retention < 0.15 && a.v3s > 500) return 'Weak retention after the hook — tighten the middle of the video'
  if (a.v3s < 200 && a.conversations > 5) return 'Low views, high-quality patients — small audience but strong targeting'
  return 'Performing within normal range'
}

export default function VideoPage() {
  const [rows, setRows] = useState<SpendRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const { data, error } = await supabase
        .from('marketing_daily_spend')
        .select('meta_ad_id, meta_ad_name, spend_bdt, conversations, video_3s_views, video_50_views')
        .gte('date', since.toISOString().slice(0, 10))
        .gt('video_3s_views', 0)
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data as SpendRow[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState message="No video ad activity in the last 30 days." />

  const byAd = new Map<string, Agg>()
  for (const r of rows) {
    const agg = byAd.get(r.meta_ad_id) ?? { meta_ad_name: r.meta_ad_name, spend: 0, conversations: 0, v3s: 0, v50: 0 }
    agg.spend += n(r.spend_bdt)
    agg.conversations += r.conversations
    agg.v3s += r.video_3s_views
    agg.v50 += r.video_50_views
    byAd.set(r.meta_ad_id, agg)
  }
  const ads = [...byAd.entries()].sort((a, b) => b[1].v3s - a[1].v3s)

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Video ad</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">3s views</th>
              <th className="px-3 py-2 text-right">50% views</th>
              <th className="px-3 py-2 text-right">Cost/50% view</th>
              <th className="px-3 py-2 text-right">Conversations</th>
              <th className="px-3 py-2">Diagnosis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ads.map(([id, a]) => (
              <tr key={id}>
                <td className="max-w-xs truncate px-3 py-2" title={a.meta_ad_name}>{a.meta_ad_name}</td>
                <td className="px-3 py-2 text-right">৳{a.spend.toFixed(0)}</td>
                <td className="px-3 py-2 text-right">{a.v3s.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{a.v50.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{a.v50 > 0 ? `৳${(a.spend / a.v50).toFixed(2)}` : '—'}</td>
                <td className="px-3 py-2 text-right">{a.conversations}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{diagnose(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
