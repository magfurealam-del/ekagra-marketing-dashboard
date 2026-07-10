"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, DateRangePicker, ErrorBanner, KpiBar, Pill, SectionLabel, Spinner } from "@/components/ui";
import { useCampaigns, useMonthly, defaultRange } from "@/lib/useCampaigns";
import { aggregate, cprCls, fmt, fmtM, getC, getCPR, getLeads, isActiveRunning } from "@/lib/metaCalc";

export default function OverviewTab() {
  const [range, setRange] = useState(defaultRange());
  const { campaigns, loading: cLoading, error: cError } = useCampaigns(range);
  const { monthly, loading: mLoading, error: mError } = useMonthly(range);

  const loading = cLoading || mLoading;
  const error = cError || mError;

  const totals = useMemo(() => aggregate(monthly), [monthly]);
  const acctTotals = useMemo(() => aggregate(campaigns), [campaigns]);
  const avgCPR = acctTotals.cv > 0 ? acctTotals.sp / acctTotals.cv : 0;

  const last = monthly[monthly.length - 1];
  const first = monthly[0];
  const lastCTR = +(last?.ctr || 0);
  const firstCTR = +(first?.ctr || 0);
  const ctrChg = firstCTR ? (((lastCTR - firstCTR) / firstCTR) * 100).toFixed(0) : "0";

  const chartData = monthly.map((m) => ({
    month: fmtM(m.date_start),
    spend: +m.spend || 0,
    convos: getC(m),
    leads: getLeads(m),
    ctr: +m.ctr || 0,
    cpr: getCPR(m),
  }));

  const byType: Record<string, { l: string; sp: number; cv: number; ld: number }> = {};
  campaigns.forEach((a) => {
    const k = a.type.l;
    if (!byType[k]) byType[k] = { l: k, sp: 0, cv: 0, ld: 0 };
    byType[k].sp += +(a.spend ?? 0) || 0;
    byType[k].cv += getC(a);
    byType[k].ld += getLeads(a);
  });
  const typeData = Object.values(byType)
    .filter((t) => t.sp > 0)
    .map((t) => ({ ...t, cpr: t.cv > 0 ? t.sp / t.cv : 0 }))
    .sort((a, b) => b.cv - a.cv);

  const activeAds = campaigns
    .filter(isActiveRunning)
    .sort((a, b) => getCPR(a) - getCPR(b))
    .slice(0, 8);

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(since, until) => setRange({ since, until })} />
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner label="Connecting to Meta Ads…" />
      ) : (
        <>
          <KpiBar
            items={[
              { label: "Total spend", value: fmt(totals.sp, "$0"), sub: `${fmtM(first?.date_start || range.since)} – ${fmtM(last?.date_stop || range.until)}` },
              { label: "Impressions", value: fmt(totals.im, "big"), sub: "All campaigns" },
              { label: "Clicks", value: fmt(totals.cl, "big"), sub: "Link clicks" },
              { label: "Conversations", value: fmt(totals.cv, "big"), sub: "Messaging starts" },
              {
                label: "Blended CTR",
                value: `${(totals.cl / (totals.im || 1) * 100).toFixed(2)}%`,
                sub: `${+ctrChg >= 0 ? "+" : ""}${ctrChg}% vs first month`,
                trend: +ctrChg >= 0 ? "up" : "down",
              },
              { label: "Blended CPR", value: totals.cv > 0 ? `$${(totals.sp / totals.cv).toFixed(2)}` : "—", sub: "Spend ÷ convos" },
              { label: "Latest CPR", value: `$${getCPR(last || {}).toFixed(2)}`, sub: fmtM(last?.date_start || "") },
            ]}
          />

          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card title="Monthly spend & conversations">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="spend" name="Spend" fill="#5ECBA1" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="convos" name="Convos" stroke="#EFB060" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="leads" name="Leads" stroke="#C090F0" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="CTR & CPR trend">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="ctr" name="CTR %" stroke="#5ECBA1" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="cpr" name="CPR $" stroke="#EFB060" strokeDasharray="4 3" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <SectionLabel>Content type efficiency</SectionLabel>
          <Card className="mb-3">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={typeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis dataKey="l" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                  <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="cv" name="Conversations" fill="#5ECBA1" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="ld" name="Leads" fill="#C090F0" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="cpr" name="CPR $" stroke="#F08080" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <SectionLabel>Active ads — ranked by CPR</SectionLabel>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {activeAds.map((a) => {
              const cpr = getCPR(a);
              const cv = getC(a);
              const eff = avgCPR > 0 && cpr > 0 ? ((avgCPR - cpr) / avgCPR) * 100 : 0;
              return (
                <Card key={a.id}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11.5px] font-semibold text-[#C8D5DF]" title={a.name}>
                        {a.name.length > 36 ? a.name.slice(0, 36) + "…" : a.name}
                      </div>
                      <div className="mt-1">
                        <Pill className={a.type.c}>
                          {a.type.e} {a.type.l}
                        </Pill>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <Stat value={fmt(+a.spend!, "$0")} label="spend" />
                    <Stat value={String(cv)} label="convos" />
                    <Stat value={`$${cpr.toFixed(2)}`} label={`CPR${eff !== 0 ? ` (${eff > 0 ? "+" : ""}${eff.toFixed(0)}%)` : ""}`} cls={cprCls(cpr)} />
                  </div>
                </Card>
              );
            })}
            {activeAds.length === 0 && <p className="text-sm text-muted2">No active, spending campaigns in this range.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, cls }: { value: string; label: string; cls?: string }) {
  return (
    <div>
      <div className={`text-sm font-bold ${cls || "text-text"}`}>{value}</div>
      <div className="text-[9.5px] text-muted2">{label}</div>
    </div>
  );
}
