"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, DateRangePicker, ErrorBanner, Pill, SectionLabel, Spinner } from "@/components/ui";
import { defaultRange, useCampaigns } from "@/lib/useCampaigns";
import { cprCls, fmt, getCPR, getVid, type Campaign } from "@/lib/metaCalc";

type Mode = "relative" | "absolute";

const COLORS = ["#82D6A7", "#E7B45F", "#89A9E8", "#EF8F84", "#A98BEA", "#E7B25A", "#5FC6C0", "#F28CB8", "#B8D56C", "#D990E8"];
const MARKS = [
  { key: "p25", label: "25% hook", short: "25%" },
  { key: "p50", label: "50%", short: "50%" },
  { key: "p75", label: "75%", short: "75%" },
  { key: "p100", label: "100% complete", short: "100%" },
] as const;

interface VideoAd {
  id: string;
  name: string;
  status: string;
  type: Campaign["type"];
  color: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  thruplay: number;
  hookRate: number;
  thruplayRate: number;
  completionRate: number;
  dropTo50: number;
  cpr: number;
}

export default function VideoTab() {
  const [range, setRange] = useState(defaultRange());
  const [mode, setMode] = useState<Mode>("relative");
  const { campaigns, loading, error } = useCampaigns(range);

  const ads = useMemo(
    () =>
      campaigns
        .filter((a) => getVid(a.video_p25_watched_actions) > 0)
        .sort((a, b) => (+b.spend! || 0) - (+a.spend! || 0))
        .map<VideoAd>((a, i) => {
          const p25 = getVid(a.video_p25_watched_actions);
          const p50 = getVid(a.video_p50_watched_actions);
          const p75 = getVid(a.video_p75_watched_actions);
          const p100 = getVid(a.video_p100_watched_actions);
          const thruplay = getVid(a.video_thruplay_watched_actions);
          const impressions = +a.impressions! || 0;
          return {
            id: a.id,
            name: a.name,
            status: a.status,
            type: a.type,
            color: COLORS[i % COLORS.length],
            spend: +a.spend! || 0,
            impressions,
            reach: +a.reach! || 0,
            frequency: +a.frequency! || 0,
            p25,
            p50,
            p75,
            p100,
            thruplay,
            hookRate: impressions > 0 ? (p25 / impressions) * 100 : 0,
            thruplayRate: impressions > 0 ? (thruplay / impressions) * 100 : 0,
            completionRate: p25 > 0 ? (p100 / p25) * 100 : 0,
            dropTo50: p25 > 0 ? ((p25 - p50) / p25) * 100 : 0,
            cpr: getCPR(a),
          };
        }),
    [campaigns]
  );

  const totals = useMemo(() => {
    const p25 = ads.reduce((s, a) => s + a.p25, 0);
    const p100 = ads.reduce((s, a) => s + a.p100, 0);
    const thruplay = ads.reduce((s, a) => s + a.thruplay, 0);
    const impressions = ads.reduce((s, a) => s + a.impressions, 0);
    const spend = ads.reduce((s, a) => s + a.spend, 0);
    return {
      p25,
      p100,
      thruplay,
      impressions,
      spend,
      hookRate: impressions > 0 ? (p25 / impressions) * 100 : 0,
      thruplayRate: impressions > 0 ? (thruplay / impressions) * 100 : 0,
      completionRate: p25 > 0 ? (p100 / p25) * 100 : 0,
    };
  }, [ads]);

  const chartData = useMemo(
    () =>
      MARKS.map((mark) => {
        const row: Record<string, string | number> = { stage: mark.short, label: mark.label };
        let avgNumerator = 0;
        ads.forEach((ad) => {
          const raw = ad[mark.key];
          avgNumerator += raw;
          row[ad.id] = mode === "relative" ? (ad.p25 > 0 ? (raw / ad.p25) * 100 : 0) : raw;
        });
        row.accountAverage =
          mode === "relative" ? (totals.p25 > 0 ? (avgNumerator / totals.p25) * 100 : 0) : avgNumerator;
        return row;
      }),
    [ads, mode, totals.p25]
  );

  const bestHook = ads.reduce<VideoAd | null>((best, ad) => (!best || ad.hookRate > best.hookRate ? ad : best), null);
  const bestThruplay = ads.reduce<VideoAd | null>((best, ad) => (!best || ad.thruplayRate > best.thruplayRate ? ad : best), null);

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(since, until) => setRange({ since, until })} />
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner label="Loading video retention..." />
      ) : ads.length === 0 ? (
        <p className="py-5 text-muted2">No video data for this period.</p>
      ) : (
        <>
          <SectionLabel>Watch-time retention - all video ads compared</SectionLabel>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <HeroMetric label="Video audience size" value={fmt(totals.impressions, "big")} sub={`${fmt(totals.p25, "big")} reached 25%`} />
            <HeroMetric label="Hook rate" value={`${totals.hookRate.toFixed(1)}%`} sub={bestHook ? `Best: ${shortName(bestHook.name, 24)}` : undefined} />
            <HeroMetric label="ThruPlay rate" value={`${totals.thruplayRate.toFixed(1)}%`} sub={`${fmt(totals.thruplay, "big")} thruplays`} />
            <HeroMetric label="Completion from hook" value={`${totals.completionRate.toFixed(1)}%`} sub={bestThruplay ? `Top thruplay: ${shortName(bestThruplay.name, 20)}` : undefined} />
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted2">
                    Retention curve
                  </div>
                  <p className="mt-1 max-w-[900px] text-xs leading-relaxed text-muted">
                    Each line is one video ad visible in this date range. Relative mode shows the share of 25%
                    viewers still watching at 50%, 75%, and completion. Absolute mode shows raw viewer counts.
                    The dashed line is the account average.
                  </p>
                </div>
                <div className="flex rounded-lg border border-border2 bg-bg p-1">
                  <ModeButton active={mode === "relative"} onClick={() => setMode("relative")} label="Relative" />
                  <ModeButton active={mode === "absolute"} onClick={() => setMode("absolute")} label="Absolute" />
                </div>
              </div>
            </div>

            <div className="px-3 pb-4 pt-3">
              <div className="h-[430px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 18, right: 28, left: 8, bottom: 8 }}>
                    <CartesianGrid stroke="#2A3543" strokeOpacity={0.85} />
                    <XAxis dataKey="stage" tick={{ fill: "#718396", fontSize: 12 }} axisLine={{ stroke: "#2A3543" }} />
                    <YAxis
                      tick={{ fill: "#718396", fontSize: 12 }}
                      axisLine={{ stroke: "#2A3543" }}
                      tickFormatter={(v) => (mode === "relative" ? `${Math.round(v)}%` : fmt(v, "big"))}
                      domain={mode === "relative" ? [0, 100] : [0, "auto"]}
                    />
                    <Tooltip content={<VideoTooltip ads={ads} mode={mode} />} />
                    {ads.map((ad) => (
                      <Line
                        key={ad.id}
                        type="monotone"
                        dataKey={ad.id}
                        name={ad.name}
                        stroke={ad.color}
                        strokeWidth={2.4}
                        dot={{ r: 4, strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                        isAnimationActive={false}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="accountAverage"
                      name="Account average"
                      stroke="#94A3B8"
                      strokeWidth={2}
                      strokeDasharray="7 7"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 px-1 text-[11px] text-muted">
                {ads.map((ad) => (
                  <div key={ad.id} className="flex max-w-[260px] items-center gap-1.5">
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: ad.color }} />
                    <span className="truncate" title={ad.name}>{ad.name}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="h-px w-6 border-t border-dashed border-[#94A3B8]" />
                  <span>Account average</span>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.4fr_0.9fr]">
            <Card title="Ads visible in this range">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-[11.5px]">
                  <thead className="text-[10px] uppercase tracking-wider text-muted2">
                    <tr>
                      <th className="pb-2">Ad</th>
                      <th className="pb-2 text-right">Video size</th>
                      <th className="pb-2 text-right">Hook</th>
                      <th className="pb-2 text-right">ThruPlay</th>
                      <th className="pb-2 text-right">Completion</th>
                      <th className="pb-2 text-right">Drop 25-50</th>
                      <th className="pb-2 text-right">Spend</th>
                      <th className="pb-2 text-right">CPR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ads.map((ad) => (
                      <tr key={ad.id} className="border-t border-border align-top">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-start gap-2">
                            <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: ad.color }} />
                            <div>
                              <div className="max-w-[360px] truncate font-semibold text-[#C8D5DF]" title={ad.name}>{ad.name}</div>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                <Pill className={ad.type.c}>{ad.type.e} {ad.type.l}</Pill>
                                <Pill className={ad.status === "ACTIVE" ? "p-a" : "p-p"}>{ad.status}</Pill>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-[#C8D5DF]">
                          {fmt(ad.impressions, "big")}
                          <div className="text-[10px] text-muted2">{fmt(ad.p25, "big")} hooks</div>
                        </td>
                        <td className="py-2.5 text-right text-warn">{ad.hookRate.toFixed(1)}%</td>
                        <td className="py-2.5 text-right text-accent">
                          {ad.thruplayRate.toFixed(1)}%
                          <div className="text-[10px] text-muted2">{fmt(ad.thruplay, "big")}</div>
                        </td>
                        <td className="py-2.5 text-right text-[#C8D5DF]">{ad.completionRate.toFixed(1)}%</td>
                        <td className={`py-2.5 text-right ${ad.dropTo50 > 60 ? "text-danger2" : ad.dropTo50 > 40 ? "text-warn" : "text-accent"}`}>
                          {ad.dropTo50.toFixed(0)}%
                        </td>
                        <td className="py-2.5 text-right text-[#C8D5DF]">{fmt(ad.spend, "$0")}</td>
                        <td className={`py-2.5 text-right ${cprCls(ad.cpr)}`}>{ad.cpr ? fmt(ad.cpr, "$") : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Read the curve">
              <div className="space-y-3 text-xs leading-relaxed text-muted">
                <InsightLine label="Video size" value="Impressions in the selected range; hooks show the count reaching 25%." />
                <InsightLine label="ThruPlay rate" value="ThruPlays divided by impressions, useful for comparing different audience sizes." />
                <InsightLine label="Relative curve" value="Best for creative quality: each video starts at 100% once viewers reach 25%." />
                <InsightLine label="Absolute curve" value="Best for scale: shows how many viewers remain at each watch milestone." />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-[#2A394A] text-white shadow-sm" : "text-muted hover:bg-card hover:text-[#C8D5DF]"
      }`}
    >
      {label}
    </button>
  );
}

function HeroMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="min-h-[98px]">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted2">{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none text-text">{value}</div>
      {sub && <div className="mt-2 truncate text-[11px] text-muted">{sub}</div>}
    </Card>
  );
}

function InsightLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-semibold text-[#C8D5DF]">{label}</div>
      <div>{value}</div>
    </div>
  );
}

interface VideoTooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  ads: VideoAd[];
  mode: Mode;
}

function VideoTooltip({ active, payload, label, ads, mode }: VideoTooltipProps) {
  if (!active || !payload?.length) return null;
  const stage = String(label);
  return (
    <div className="max-h-[340px] min-w-[260px] overflow-y-auto rounded-lg border border-border2 bg-[#101923] p-3 text-[11px] shadow-xl">
      <div className="mb-2 font-bold text-[#C8D5DF]">{stage} watch mark</div>
      <div className="space-y-1.5">
        {payload
          .filter((p) => p.dataKey !== "accountAverage")
          .map((p) => {
            const ad = ads.find((x) => x.id === p.dataKey);
            if (!ad) return null;
            return (
              <div key={p.dataKey} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: ad.color }} />
                  <span className="truncate">{ad.name}</span>
                </div>
                <span className="font-semibold text-[#C8D5DF]">
                  {mode === "relative" ? `${Number(p.value).toFixed(1)}%` : fmt(Number(p.value), "big")}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function shortName(name: string, max: number) {
  return name.length > max ? `${name.slice(0, max - 1)}...` : name;
}
