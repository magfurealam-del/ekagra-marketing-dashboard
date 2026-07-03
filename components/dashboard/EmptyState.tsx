export default function EmptyState({ message = 'No data for this range.' }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}
