'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BucketBadge from '@/components/dashboard/BucketBadge'
import EmptyState from '@/components/dashboard/EmptyState'
import ErrorState from '@/components/dashboard/ErrorState'
import LoadingState from '@/components/dashboard/LoadingState'

type QueueRow = {
  queue_id: number
  patient_id: number | null
  patient_name: string
  phone_e164: string
  category: string
  priority_score: number
  campaign_bucket: string
  lead_type: string | null
  last_relevant_date: string | null
  days_since: number | null
  followup_count: number
  max_followups: number
  status: string
  no_show_risk: string | null
  pinned_to_top: boolean
  recommended_action: string
}

export default function FollowupsPage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('vw_no_show_recovery_queue')
        .select('*')
        .order('pinned_to_top', { ascending: false })
        .order('priority_score', { ascending: false })
        .limit(300)
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data as QueueRow[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <ErrorState message={error} />
  if (!rows) return <LoadingState />
  if (rows.length === 0) return <EmptyState message="No open follow-ups — queue is clear." />

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        {rows.length} open follow-up/no-show items, ordered by priority. Writeback actions (mark called, book, close) are planned for the next iteration.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Patient</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Days since</th>
              <th className="px-3 py-2 text-right">Follow-ups</th>
              <th className="px-3 py-2">Recommended action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.queue_id} className={r.pinned_to_top ? 'bg-rose-50' : undefined}>
                <td className="px-3 py-2 font-medium">{r.priority_score}</td>
                <td className="px-3 py-2">{r.patient_name}</td>
                <td className="px-3 py-2">{r.phone_e164}</td>
                <td className="px-3 py-2"><BucketBadge bucket={r.campaign_bucket} /></td>
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2 text-right">{r.days_since ?? '—'}</td>
                <td className="px-3 py-2 text-right">{r.followup_count} / {r.max_followups}</td>
                <td className="px-3 py-2">{r.recommended_action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
