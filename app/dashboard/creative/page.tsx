'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BucketBadge from '@/components/dashboard/BucketBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'
import { n } from '@/lib/format'

type Tag = {
  meta_ad_id: string
  meta_ad_name: string
  campaign_bucket: string | null
  creative_format: string | null
  primary_hook: string | null
  character_type: string | null
  language_style: string | null
  cta_type: string | null
  offer_type: string | null
  thumbnail_url: string | null
}

type Perf = { meta_ad_id: string; spend_usd: string | number; clicks: number; conversations: number; ctr_pct: string | number | null }

export default function CreativePage() {
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [perfByAd, setPerfByAd] = useState<Map<string, { spend: number; clicks: number; conversations: number }>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date()
      since.setDate(since.getDate() - 30)
      const [tagsRes, perfRes] = await Promise.all([
        supabase.from('marketing_creative_tags').select('*'),
        supabase.from('vw_ad_performance_with_crm').select('meta_ad_id, spend_usd, clicks, conversations').gte('date', since.toISOString().slice(0, 10)),
      ])
      if (cancelled) return
      if (tagsRes.error) setError(tagsRes.error.message)
      else setTags(tagsRes.data as Tag[])
      if (!perfRes.error) {
        const map = new Map<string, { spend: number; clicks: number; conversations: number }>()
        for (const p of (perfRes.data as Perf[]) ?? []) {
          const agg = map.get(p.meta_ad_id) ?? { spend: 0, clicks: 0, conversations: 0 }
          agg.spend += n(p.spend_usd)
          agg.clicks += p.clicks
          agg.conversations += p.conversations
          map.set(p.meta_ad_id, agg)
        }
        setPerfByAd(map)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!tags) return <LoadingState />
  if (tags.length === 0) return <EmptyState message="No creatives have been tagged yet." />

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Creative tags with 30-day spend/click performance where available. Untagged fields show as “—”.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tags.map((t) => {
          const p = perfByAd.get(t.meta_ad_id)
          return (
            <div key={t.meta_ad_id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate font-medium" title={t.meta_ad_name}>{t.meta_ad_name}</span>
                {t.campaign_bucket && <BucketBadge bucket={t.campaign_bucket} />}
              </div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-600">
                <dt>Hook</dt><dd>{t.primary_hook ?? '—'}</dd>
                <dt>Format</dt><dd>{t.creative_format ?? '—'}</dd>
                <dt>Character</dt><dd>{t.character_type ?? '—'}</dd>
                <dt>Language</dt><dd>{t.language_style ?? '—'}</dd>
                <dt>CTA</dt><dd>{t.cta_type ?? '—'}</dd>
                <dt>Offer</dt><dd>{t.offer_type ?? '—'}</dd>
              </dl>
              <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs">
                <span>Spend: {p ? `$${p.spend.toFixed(0)}` : '—'}</span>
                <span>Clicks: {p ? p.clicks : '—'}</span>
                <span>Conv: {p ? p.conversations : '—'}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
