"use client";

// Small shared UI primitives used across every tab: cards, KPI pills,
// section labels, loading/error states, and a from/to date-range picker.

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-border bg-card p-4 px-[18px] ${className}`}>
      {title && <div className="mb-2.5 text-xs font-semibold text-[#C8D5DF]">{title}</div>}
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-[18px] mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted2">
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function KpiBar({ items }: { items: { label: string; value: string; sub?: string; trend?: "up" | "down" }[] }) {
  return (
    <div className="mb-[18px] flex gap-0.5 overflow-x-auto rounded-card bg-card p-0.5">
      {items.map((it, i) => (
        <div key={i} className={`min-w-[105px] flex-1 rounded-lg p-3 px-3.5 text-center ${i === 0 ? "bg-bg" : ""}`}>
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted2">{it.label}</div>
          <div className="text-xl font-bold leading-none text-text">{it.value}</div>
          {it.sub && (
            <div
              className={`mt-0.5 text-[10px] ${
                it.trend === "up" ? "text-accent" : it.trend === "down" ? "text-danger2" : "text-muted2"
              }`}
            >
              {it.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`pill ${className}`}>{children}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2.5">
      <div className="ek-spinner h-7 w-7 rounded-full border-[3px] border-border border-t-accent" />
      {label && <div className="text-[11.5px] text-[#5A7A8A]">{label}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-3.5 rounded-lg border border-[#5A2020] bg-[#2A1515] px-3.5 py-2.5 text-[12.5px] text-[#F09595]">
      ⚠ {message}
    </div>
  );
}

export function DateRangePicker({
  since,
  until,
  onChange,
}: {
  since: string;
  until: string;
  onChange: (since: string, until: string) => void;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        From
        <input
          type="date"
          value={since}
          max={until}
          onChange={(e) => onChange(e.target.value, until)}
          className="rounded-md border border-border2 bg-card px-2 py-1.5 text-xs text-[#C8D5DF]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        To
        <input
          type="date"
          value={until}
          min={since}
          onChange={(e) => onChange(since, e.target.value)}
          className="rounded-md border border-border2 bg-card px-2 py-1.5 text-xs text-[#C8D5DF]"
        />
      </label>
    </div>
  );
}
