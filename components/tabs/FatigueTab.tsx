"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, DateRangePicker, ErrorBanner, Spinner } from "@/components/ui";
import { metaAdsAll } from "@/lib/api";
import { classifyFatigue, daysAgoStr, getC, heatClr, todayStr, type FatigueStatus } from "@/lib/metaCalc";

// Faithful port of renderFatigue() from the original dashboard: per-campaign
// daily rows are merged, then fScore = % change of last-7-day avg CTR vs the
// prior 7-day avg CTR. Thresholds: <-30% high, <-15% medium, >10% growing,
// else stable (needs >=14 days; needs >=7 for a "stable" fallback, else "na").

interface DailyRow {
  campaign_id: string;
  campaign_name: string;
  date_start: string;
  spend?: string;
  ctr?: string;
  frequency?: string;
  actions?: any[];
}

interface DayMetrics {
  sp: number;
  ctr: number;
  cv: number;
  freq: number;
}

interface AdFatigue {
  id: string;
  name: string;
  days: Record<string, DayMetrics>;
  dates: string[];
  totSp: number;
  totCv: number;
  avgCTR: number;
  lastFreq: number;
  r7avg: number;
  p7avg: number;
  fScore: number;
  fat: FatigueStatus;
}

const BADGE: Record<FatigueStatus, [string, string]> = {
  high: ["bg-danger/20 text-danger2 border border-danger/40", "🔴 High fatigue"],
  medium: ["bg-warn/20 text-warn border border-warn/40", "🟡 Fatiguing"],
  growing: ["bg-accent/20 text-accent border border-accent/40", "🟢 Growing"],
  stable: ["bg-[#647888]/20 text-[#8A9AAA] border border-[#647888]/30", "⚪ Stable"],
  na: ["bg-[#3C4650]/20 text-[#4A5A6A] border border-[#3C4650]/30", "🔘 Not enough data"],
};

const ACTION_TEXT: Record<FatigueStatus, (a: AdFatigue) => string> = {
  high: (a) =>
    `Pause this ad immediately. CTR dropped ${Math.abs(a.fScore).toFixed(0)}% — the audience has seen it too many times. Duplicate the ad with fresh creative before reactivating.`,
  medium: (a) =>
    `Prepare a new creative version now. CTR is declining ${Math.abs(a.fScore).toFixed(0)}% — you have roughly 7–10 days before it becomes inefficient. Don't wait until it's fully fatigued.`,
  growing: (a) =>
    `CTR is rising +${a.fScore.toFixed(0)}%. The algorithm is finding its audience. Consider increasing daily budget by 20–30% to capitalise while performance is improving.`,
  stable: () => `Performance is stable within normal variation. No action needed. Check again in 7 days.`,
  na: (a) => `Only ${a.dates.length} day(s) of data — need at least 14 days to detect fatigue trends.`,
};

export default function FatigueTab() {
  const [since, setSince] = useState(daysAgoStr(30));
  const [until, setUntil] = useState(todayStr());
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"card" | "heat">("card");
  const [campFilter, setCampFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    metaAdsAll("insights", {
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,reach,frequency,actions,cost_per_result,date_start,date_stop",
      level: "campaign",
      time_increment: "1",
      since,
      until,
    })
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load daily data"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [since, until]);

  const { ads, dates } = useMemo(() => {
    const adMap: Record<string, AdFatigue> = {};
    rows.forEach((r) => {
      if (!adMap[r.campaign_id]) {
        adMap[r.campaign_id] = {
          id: r.campaign_id,
          name: r.campaign_name,
          days: {},
          dates: [],
          totSp: 0,
          totCv: 0,
          avgCTR: 0,
          lastFreq: 0,
          r7avg: 0,
          p7avg: 0,
          fScore: 0,
          fat: "na",
        };
      }
      const ad = adMap[r.campaign_id];
      if (!ad.days[r.date_start]) {
        ad.days[r.date_start] = {
          sp: +(r.spend || 0),
          ctr: +(r.ctr || 0),
          cv: getC(r as any),
          freq: +(r.frequency || 0),
        };
      } else {
        const d = ad.days[r.date_start];
        d.sp += +(r.spend || 0);
        d.ctr = Math.max(d.ctr, +(r.ctr || 0));
        d.cv += getC(r as any);
      }
    });

    const allDates = Array.from(new Set(rows.map((r) => r.date_start))).sort();

    const list = Object.values(adMap).map((ad) => {
      const d = Object.keys(ad.days).sort();
      ad.dates = d;
      ad.totSp = Object.values(ad.days).reduce((s, x) => s + x.sp, 0);
      ad.totCv = Object.values(ad.days).reduce((s, x) => s + x.cv, 0);
      ad.avgCTR = d.length ? Object.values(ad.days).reduce((s, x) => s + x.ctr, 0) / d.length : 0;
      ad.lastFreq = d.length ? ad.days[d[d.length - 1]].freq : 0;

      if (d.length >= 14) {
        const r7 = d.slice(-7).map((x) => ad.days[x].ctr);
        const p7 = d.slice(-14, -7).map((x) => ad.days[x].ctr);
        const ar = r7.reduce((s, v) => s + v, 0) / 7;
        const ap = p7.reduce((s, v) => s + v, 0) / 7;
        ad.r7avg = ar;
        ad.p7avg = ap;
        ad.fScore = ap > 0 ? ((ar - ap) / ap) * 100 : 0;
      } else {
        ad.fScore = 0;
        ad.r7avg = ad.avgCTR;
        ad.p7avg = ad.avgCTR;
      }
      ad.fat = classifyFatigue(ad.fScore, d.length);
      return ad;
    });

    const order: Record<FatigueStatus, number> = { high: 0, medium: 1, na: 2, stable: 3, growing: 4 };
    list.sort((a, b) => order[a.fat] - order[b.fat]);

    return { ads: list, dates: allDates };
  }, [rows]);

  const filteredAds = campFilter === "all" ? ads : ads.filter((a) => a.id === campFilter);
  const byF = filteredAds.reduce(
    (acc, a) => ({ ...acc, [a.fat]: (acc[a.fat] || 0) + 1 }),
    {} as Record<FatigueStatus, number>
  );
  const urgent = filteredAds.filter((a) => a.fat === "high");
  const warn = filteredAds.filter((a) => a.fat === "medium");

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <DateRangePicker since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />
        <select
          value={campFilter}
          onChange={(e) => setCampFilter(e.target.value)}
          className="rounded-md border border-border2 bg-card px-2.5 py-1.5 text-xs text-[#C8D5DF]"
        >
          <option value="all">All campaigns</option>
          {ads.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.name || a.id).slice(0, 42)}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setView("card")}
            className={`rounded-md border px-3 py-1.5 text-[11.5px] font-medium ${
              view === "card" ? "border-[#3A4A5A] bg-[#253545] text-[#C8D5DF]" : "border-border2 bg-card text-muted2"
            }`}
          >
            Card view
          </button>
          <button
            onClick={() => setView("heat")}
            className={`rounded-md border px-3 py-1.5 text-[11.5px] font-medium ${
              view === "heat" ? "border-[#3A4A5A] bg-[#253545] text-[#C8D5DF]" : "border-border2 bg-card text-muted2"
            }`}
          >
            Heatmap
          </button>
        </div>
      </div>
      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Spinner label="Loading daily performance…" />
      ) : rows.length === 0 ? (
        <p className="text-muted2">No data. Widen the date range.</p>
      ) : (
        <>
          <div
            className={`mb-4 rounded-card border p-3.5 px-[18px] ${
              urgent.length || warn.length ? "border-danger/30 bg-[#2A1515]" : "border-border bg-[#13202C]"
            }`}
          >
            <div className={`mb-2 text-xs font-bold ${urgent.length || warn.length ? "text-danger2" : "text-accent"}`}>
              {urgent.length || warn.length
                ? `⚡ ${urgent.length + warn.length} ad(s) need attention`
                : "✅ No urgent fatigue detected"}
            </div>
            {urgent.length || warn.length ? (
              <div className="flex flex-col gap-1.5">
                {[...urgent, ...warn].map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${BADGE[a.fat][0]}`}>{BADGE[a.fat][1]}</span>
                    <strong className="text-[#C8D5DF]">{a.name.length > 40 ? a.name.slice(0, 40) + "…" : a.name}</strong>
                    <span className="text-muted2">{a.fScore.toFixed(0)}% CTR drop · freq {a.lastFreq.toFixed(2)}</span>
                    <span className={`ml-auto ${a.fat === "high" ? "text-danger2" : "text-warn"}`}>
                      {a.fat === "high" ? "Pause or replace creative" : "Prepare fresh creative now"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted2">All active ads are stable or growing. Check back in a few days or widen the date range.</p>
            )}
          </div>

          <div className="mb-4 flex flex-wrap gap-2.5">
            {[
              ["High fatigue", byF.high || 0, "text-danger2", "Pause/replace now"],
              ["Fatiguing", byF.medium || 0, "text-warn", "Refresh soon"],
              ["Growing", byF.growing || 0, "text-accent", "Scale up"],
              ["Stable / new", (byF.stable || 0) + (byF.na || 0), "text-muted", "Continue"],
            ].map(([label, count, cls, sub]) => (
              <div key={label as string} className="min-w-[100px] flex-1 rounded-card border border-border bg-card p-3 px-4 text-center">
                <div className={`text-2xl font-bold leading-none ${cls}`}>{count}</div>
                <div className="mt-0.5 text-[10px] text-muted2">
                  {label}
                  <br />
                  <span className="text-[9px]">{sub}</span>
                </div>
              </div>
            ))}
          </div>

          {view === "card" ? (
            <div className="flex flex-col gap-2.5">
              {filteredAds.map((a) => {
                const [badgeCls, badgeLabel] = BADGE[a.fat];
                const freqClr = a.lastFreq < 1.5 ? "#5ECBA1" : a.lastFreq < 2.5 ? "#EFB060" : "#F08080";
                const freqPct = Math.min((a.lastFreq / 4) * 100, 100);
                const fScoreStr = a.fat === "na" ? "<14 days data" : `${a.fScore > 0 ? "+" : ""}${a.fScore.toFixed(0)}% CTR in last 7d vs prior 7d`;
                return (
                  <Card key={a.id}>
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2.5">
                      <div>
                        <div className="text-[13px] font-semibold text-[#C8D5DF]" title={a.name}>
                          {a.name.length > 52 ? a.name.slice(0, 52) + "…" : a.name}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${badgeCls}`}>
                        {badgeLabel}
                      </span>
                    </div>
                    <div className="mb-2 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                      <Metric val={`${a.avgCTR.toFixed(2)}%`} lbl={`Avg CTR (${a.dates.length}d)`} />
                      <Metric
                        val={a.r7avg ? `${a.r7avg.toFixed(2)}%` : "—"}
                        lbl="Last 7d avg CTR"
                        sub={fScoreStr}
                        subCls={a.fat === "na" ? "text-muted2" : a.fScore > 0 ? "text-accent" : "text-danger2"}
                        cls={a.fat === "high" || a.fat === "medium" ? "text-danger2" : a.fat === "growing" ? "text-accent" : "text-[#C8D5DF]"}
                      />
                      <Metric val={a.lastFreq.toFixed(2)} lbl="Frequency (latest)" cls={a.lastFreq > 2.5 ? "text-danger2" : a.lastFreq > 1.5 ? "text-warn" : "text-accent"} />
                      <Metric val={`$${Math.round(a.totSp)}`} lbl="Spend in period" />
                      <Metric val={String(a.totCv)} lbl="Convos in period" />
                    </div>
                    <div className="mb-2">
                      <div className="mb-1 text-[10px] text-muted2">Audience frequency (how often same person sees ad)</div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-bg">
                        <div className="h-full" style={{ width: `${freqPct}%`, background: freqClr }} />
                        <div className="absolute top-0 h-full w-px bg-white/30" style={{ left: `${Math.min((2.5 / 4) * 100, 100)}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-[10.5px]">
                        <span style={{ color: freqClr, fontWeight: 700 }}>{a.lastFreq.toFixed(2)}x avg</span>
                        <span className="text-muted2">⚠ at 2.5x</span>
                      </div>
                    </div>
                    <div className={`rounded-md px-3 py-2 text-xs leading-relaxed ${actionCls(a.fat)}`}>
                      <strong>Action:</strong> {ACTION_TEXT[a.fat](a)}
                    </div>
                  </Card>
                );
              })}
              {filteredAds.length === 0 && <p className="text-muted2">No campaigns to analyze.</p>}
            </div>
          ) : (
            <Card className="overflow-x-auto">
              <div className="mb-2 flex flex-wrap items-center gap-3 text-[10.5px] text-muted2">
                <Legend color="#1D9E75" label="60%+ above avg" />
                <Legend color="#3AAA80" label="20–60% above" />
                <Legend color="#25393D" label="±15% (baseline)" />
                <Legend color="#4A2525" label="15–40% below" />
                <Legend color="#7A1515" label="40%+ below avg" />
              </div>
              <table className="hm border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 min-w-[160px] border border-border bg-[#13202C] p-1 text-left text-[9px] font-bold text-muted2">Ad name</th>
                    <th className="min-w-[100px] border border-border bg-[#13202C] p-1 text-left text-[9px] font-bold text-muted2">Signal</th>
                    <th className="min-w-[55px] border border-border bg-[#13202C] p-1 text-right text-[9px] font-bold text-muted2">7d chg</th>
                    {dates.map((d) => (
                      <th key={d} title={d} className="min-w-[20px] border border-border bg-[#13202C] p-1 text-[9px] font-bold text-muted2">
                        {d.slice(8)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAds.map((ad) => (
                    <tr key={ad.id}>
                      <td className="sticky left-0 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap border border-border bg-card px-2 py-1 font-medium text-[#C8D5DF]" title={ad.name}>
                        {ad.name.length > 30 ? ad.name.slice(0, 30) + "…" : ad.name}
                      </td>
                      <td className="border border-border px-2 py-1">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${BADGE[ad.fat][0]}`}>{BADGE[ad.fat][1]}</span>
                      </td>
                      <td
                        className="border border-border px-2 py-1 text-right font-semibold"
                        style={{ color: ad.fat === "high" || ad.fat === "medium" ? "#F08080" : ad.fat === "growing" ? "#5ECBA1" : "#6A8A9A" }}
                      >
                        {ad.fat === "na" ? "—" : `${ad.fScore > 0 ? "+" : ""}${ad.fScore.toFixed(0)}%`}
                      </td>
                      {dates.map((d) => {
                        const dd = ad.days[d];
                        if (!dd) return <td key={d} className="border border-border" />;
                        const rel = ad.avgCTR > 0 ? dd.ctr / ad.avgCTR : 1;
                        return (
                          <td
                            key={d}
                            className="border border-border"
                            style={{ background: heatClr(rel) }}
                            title={`${d}: CTR ${dd.ctr.toFixed(2)}% · ${rel > 1 ? "+" : ""}${((rel - 1) * 100).toFixed(0)}% vs this ad's avg · $${dd.sp.toFixed(1)} spend`}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ val, lbl, sub, cls, subCls }: { val: string; lbl: string; sub?: string; cls?: string; subCls?: string }) {
  return (
    <div>
      <div className={`text-[15px] font-bold ${cls || "text-text"}`}>{val}</div>
      <div className="text-[9.5px] text-muted2">{lbl}</div>
      {sub && <div className={`text-[9.5px] ${subCls || "text-muted2"}`}>{sub}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function actionCls(fat: FatigueStatus) {
  if (fat === "high") return "bg-danger/10 border border-danger/25 text-danger2";
  if (fat === "medium") return "bg-warn/10 border border-warn/25 text-warn";
  if (fat === "growing") return "bg-accent/10 border border-accent/25 text-accent";
  return "bg-[#1A2535]/50 border border-border text-muted";
}
