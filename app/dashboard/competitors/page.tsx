'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'

type Row = {
  id: string
  competitor_name: string
  service_line: string | null
  hook: string | null
  offer_type: string | null
  cta: string | null
  creative_format: string | null
  language_style: string | null
  first_seen_date: string | null
  notes: string | null
  ad_library_url: string | null
}

export default function CompetitorsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.from('competitor_ad_intelligence').select('*').order('first_seen_date', { ascending: false })
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
  if (rows.length === 0) {
    return (
      <EmptyState message="No competitor intelligence logged yet. This is a creative comparison log (Evercare, United, Square, Labaid, Popular, Ibn Sina, BRB, diabetes/wound clinics) — add entries via marketing_creative_tags-style manual entry once a review cadence is set up." />
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
          <tr>
            <th className="px-3 py-2">Competitor</th>
            <th className="px-3 py-2">Service</th>
            <th className="px-3 py-2">Hook</th>
            <th className="px-3 py-2">Offer</th>
            <th className="px-3 py-2">CTA</th>
            <th className="px-3 py-2">Format</th>
            <th className="px-3 py-2">Language</th>
            <th className="px-3 py-2">First seen</th>
            <th className="px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium">{r.competitor_name}</td>
              <td className="px-3 py-2">{r.service_line ?? '—'}</td>
              <td className="px-3 py-2">{r.hook ?? '—'}</td>
              <td className="px-3 py-2">{r.offer_type ?? '—'}</td>
              <td className="px-3 py-2">{r.cta ?? '—'}</td>
              <td className="px-3 py-2">{r.creative_format ?? '—'}</td>
              <td className="px-3 py-2">{r.language_style ?? '—'}</td>
              <td className="px-3 py-2">{r.first_seen_date ?? '—'}</td>
              <td className="max-w-xs truncate px-3 py-2" title={r.notes ?? ''}>{r.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
