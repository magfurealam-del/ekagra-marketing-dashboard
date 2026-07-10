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
  { key: "thruplay", label: "ThruPlay", short: "ThruPlay" },
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
  narrative: VideoNarrative;
}

interface VideoNarrative {
  tone: "strong" | "mixed" | "weak";
  what: string;
  strength: string;
  weakness: string;
  action: string;
}

export default function VideoTab() {
  const [range, setRange] = useState(defaultRange());
  const [mode, setMode] = useState<Mode>("relative");
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(() => new Set());
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
          const hookRate = impressions > 0 ? (p25 / impressions) * 100 : 0;
          const thruplayRate = impressions > 0 ? (thruplay / impressions) * 100 : 0;
          const completionRate = p25 > 0 ? (p100 / p25) * 100 : 0;
          const dropTo50 = p25 > 0 ? ((p25 - p50) / p25) * 100 : 0;
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
            hookRate,
            thruplayRate,
            completionRate,
            dropTo50,
            cpr: getCPR(a),
            narrative: describeVideo({ hookRate, thruplayRate, completionRate, dropTo50, frequency: +a.frequency! || 0 }),
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

  const visibleAds = useMemo(() => ads.filter((ad) => !hiddenLines.has(ad.id)), [ads, hiddenLines]);

  const visibleTotals = useMemo(() => {
    const p25 = visibleAds.reduce((s, a) => s + a.p25, 0);
    const p100 = visibleAds.reduce((s, a) => s + a.p100, 0);
    const thruplay = visibleAds.reduce((s, a) => s + a.thruplay, 0);
    const impressions = visibleAds.reduce((s, a) => s + a.impressions, 0);
    return { p25, p100, thruplay, impressions };
  }, [visibleAds]);

  const chartData = useMemo(
    () =>
      MARKS.map((mark) => {
        const row: Record<string, string | number> = { stage: mark.short, label: mark.label };
        let avgNumerator = 0;
        visibleAds.forEach((ad) => {
          const raw = ad[mark.key];
          avgNumerator += raw;
          row[ad.id] = mode === "relative" ? (ad.p25 > 0 ? (raw / ad.p25) * 100 : 0) : raw;
        });
        const avgBase = mark.key === "thruplay" ? visibleTotals.impressions : visibleTotals.p25;
        row.accountAverage =
          mode === "relative" ? (avgBase > 0 ? (avgNumerator / avgBase) * 100 : 0) : avgNumerator;
        return row;
      }),
    [mode, visibleAds, visibleTotals.impressions, visibleTotals.p25]
  );

  const bestHook = ads.reduce<VideoAd | null>((best, ad) => (!best || ad.hookRate > best.hookRate ? ad : best), null);
  const bestThruplay = ads.reduce<VideoAd | null>((best, ad) => (!best || ad.thruplayRate > best.thruplayRate ? ad : best), null);
  const toggleLine = (id: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const resetLines = () => setHiddenLines(new Set());

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
                    Each line is one video ad visible in this date range. Relative mode shows retention past the 25%
                    hook plus the ThruPlay checkpoint. Absolute mode shows raw viewer counts. Click legend items to
                    isolate or hide specific ads. The dashed line is the visible-lines average.
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
                    <Tooltip content={<VideoTooltip ads={visibleAds} mode={mode} />} />
                    {visibleAds.map((ad) => (
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
                  <button
                    key={ad.id}
                    type="button"
                    onClick={() => toggleLine(ad.id)}
                    className={`flex max-w-[260px] items-center gap-1.5 rounded-full border px-2 py-1 transition ${
                      hiddenLines.has(ad.id)
                        ? "border-border text-muted2 opacity-45"
                        : "border-transparent text-muted hover:border-border2 hover:bg-[#14202D] hover:text-[#C8D5DF]"
                    }`}
                    title={hiddenLines.has(ad.id) ? `Show ${ad.name}` : `Hide ${ad.name}`}
                  >
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: ad.color }} />
                    <span className="truncate" title={ad.name}>{ad.name}</span>
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="h-px w-6 border-t border-dashed border-[#94A3B8]" />
                  <span>Visible average</span>
                </div>
                {hiddenLines.size > 0 && (
                  <button type="button" onClick={resetLines} className="rounded-full border border-border2 px-2 py-1 text-accent hover:bg-[#14202D]">
                    Show all
                  </button>
                )}
              </div>
            </div>
          </Card>

          <div className="mt-4 space-y-4">
            {ads.map((ad) => (
              <VideoStoryCard key={ad.id} ad={ad} totals={totals} />
            ))}
          </div>

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

function VideoStoryCard({ ad, totals }: { ad: VideoAd; totals: { hookRate: number; thruplayRate: number; completionRate: number } }) {
  const hookDelta = pctDelta(ad.hookRate, totals.hookRate);
  const thruDelta = pctDelta(ad.thruplayRate, totals.thruplayRate);
  const completionDelta = pctDelta(ad.completionRate, totals.completionRate);
  const toneClass =
    ad.narrative.tone === "strong"
      ? "border-accent/25 bg-[#152923]"
      : ad.narrative.tone === "weak"
        ? "border-danger/25 bg-[#27191B]"
        : "border-warn/25 bg-[#272414]";

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: ad.color }} />
                <h3 className="text-base font-bold text-text">{shortName(ad.name, 72)}</h3>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill className={ad.type.c}>{ad.type.e} {ad.type.l}</Pill>
                <Pill className={ad.status === "ACTIVE" ? "p-a" : "p-p"}>{ad.status}</Pill>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-right sm:grid-cols-4">
              <MiniMetric label="spend" value={fmt(ad.spend, "$0")} />
              <MiniMetric label={`hook (${formatDelta(hookDelta)} vs avg)`} value={`${ad.hookRate.toFixed(1)}%`} accent="text-accent" />
              <MiniMetric label={`thruplay (${formatDelta(thruDelta)} vs avg)`} value={`${ad.thruplayRate.toFixed(1)}%`} accent="text-[#8DD8FF]" />
              <MiniMetric label={`completion (${formatDelta(completionDelta)} vs avg)`} value={`${ad.completionRate.toFixed(0)}%`} accent="text-accent" />
            </div>
          </div>

          <p className="mt-5 text-xs text-muted">
            Retention curve — % still watching past each checkpoint. ThruPlay is shown as a separate checkpoint
            because Meta counts it as 15 seconds watched, or completion when the video is shorter than 15 seconds.
          </p>
          <div className="mt-3 h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={singleVideoData(ad)} margin={{ top: 8, right: 14, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#2A3543" strokeOpacity={0.7} />
                <XAxis dataKey="stage" tick={{ fill: "#718396", fontSize: 11 }} axisLine={{ stroke: "#2A3543" }} />
                <YAxis tick={{ fill: "#718396", fontSize: 11 }} axisLine={{ stroke: "#2A3543" }} tickFormatter={(v) => `${Math.round(Number(v))}%`} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: "#101923", border: "1px solid #344154", borderRadius: 10, color: "#C8D5DF" }}
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(1)}%`, name]}
                />
                <Line type="monotone" dataKey="retention" name="Retention" stroke={ad.color} strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="thruplay" name="ThruPlay rate" stroke="#8DD8FF" strokeWidth={2.2} strokeDasharray="5 5" dot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3 text-xs text-muted">
            <span>Video size: <strong className="text-[#C8D5DF]">{fmt(ad.impressions, "big")} impressions</strong></span>
            <span>ThruPlay: <strong className="text-[#C8D5DF]">{ad.thruplayRate.toFixed(1)}% / {fmt(ad.thruplay, "big")}</strong></span>
            <span>Biggest drop: <strong className={ad.dropTo50 > 45 ? "text-warn" : "text-accent"}>25%→50% ({ad.dropTo50.toFixed(0)}%)</strong></span>
          </div>
        </div>

        <div className={`rounded-xl border p-4 text-sm leading-relaxed ${toneClass}`}>
          <p><strong className="text-accent">What’s happening:</strong> {ad.narrative.what}</p>
          <p className="mt-4"><strong className="text-[#C8D5DF]">Strength:</strong> {ad.narrative.strength}</p>
          <p className="mt-4"><strong className="text-warn">Weakness:</strong> {ad.narrative.weakness}</p>
          <p className="mt-4"><strong className="text-accent">Suggested change:</strong> {ad.narrative.action}</p>
        </div>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value, accent = "text-text" }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className={`text-xl font-bold leading-none ${accent}`}>{value}</div>
      <div className="mt-1 text-[10px] text-muted2">{label}</div>
    </div>
  );
}

function singleVideoData(ad: VideoAd) {
  const thru = ad.thruplayRate;
  return [
    { stage: "25% hook", retention: 100, thruplay: thru },
    { stage: "ThruPlay", retention: ad.p25 > 0 ? (ad.thruplay / ad.p25) * 100 : 0, thruplay: thru },
    { stage: "50%", retention: ad.p25 > 0 ? (ad.p50 / ad.p25) * 100 : 0, thruplay: thru },
    { stage: "75%", retention: ad.p25 > 0 ? (ad.p75 / ad.p25) * 100 : 0, thruplay: thru },
    { stage: "100%", retention: ad.completionRate, thruplay: thru },
  ];
}

function describeVideo(input: { hookRate: number; thruplayRate: number; completionRate: number; dropTo50: number; frequency: number }): VideoNarrative {
  const strongHook = input.hookRate >= 8;
  const strongThru = input.thruplayRate >= 5;
  const strongCompletion = input.completionRate >= 30;
  const steepEarlyDrop = input.dropTo50 >= 55;
  const tone: VideoNarrative["tone"] =
    strongHook && strongCompletion ? "strong" : steepEarlyDrop || input.thruplayRate < 2 ? "weak" : "mixed";

  if (tone === "strong") {
    return {
      tone,
      what: `Strong retention end-to-end. The hook is pulling viewers in, ${input.thruplayRate.toFixed(1)}% of impressions reach ThruPlay, and ${input.completionRate.toFixed(0)}% of hooked viewers complete the video.`,
      strength: "The opening and pacing are working together; people who start watching are staying long enough to absorb the message.",
      weakness: input.frequency > 2.5 ? "Frequency is getting high, so the same audience may begin to tire if this keeps running unchanged." : "Main risk is scale: strong creative can still be limited if audience size or budget is too narrow.",
      action: "Use this as a template. Reuse the opening structure, first visual, and message sequence in weaker campaigns, then create 2-3 variants before fatigue sets in.",
    };
  }

  if (tone === "weak") {
    return {
      tone,
      what: `The curve is losing people early. ${input.dropTo50.toFixed(0)}% of hooked viewers drop before 50%, and ThruPlay is only ${input.thruplayRate.toFixed(1)}% of impressions.`,
      strength: strongHook ? "The initial promise is interesting enough to earn a hook." : "There is enough delivery data to diagnose the creative instead of guessing.",
      weakness: "The video likely takes too long to deliver the payoff, has a soft first frame, or does not make the viewer’s problem obvious quickly enough.",
      action: "Cut a shorter version with the strongest claim or patient benefit in the first 2 seconds. Move proof, outcome, or urgency earlier and test a clearer thumbnail/opening line.",
    };
  }

  return {
    tone,
    what: `Mixed performance. Hook is ${input.hookRate.toFixed(1)}%, ThruPlay is ${input.thruplayRate.toFixed(1)}%, and ${input.completionRate.toFixed(0)}% of hooked viewers finish.`,
    strength: strongThru ? "The middle section is holding attention once viewers commit." : "The creative has some audience fit, but the retention path is uneven.",
    weakness: steepEarlyDrop ? "The biggest problem is the transition after the hook; viewers are not getting enough reason to continue." : "The ending or call-to-action may not be strong enough to convert attention into completion.",
    action: steepEarlyDrop
      ? "Keep the hook but tighten seconds 3-7: remove setup, add the core benefit faster, and make the visual change more dynamic."
      : "Test a stronger closing sequence: clearer CTA, offer, doctor/patient proof, or direct next step.",
  };
}

function pctDelta(value: number, average: number) {
  if (!average) return 0;
  return ((value - average) / average) * 100;
}

function formatDelta(delta: number) {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(0)}%`;
}

function shortName(name: string, max: number) {
  return name.length > max ? `${name.slice(0, max - 1)}...` : name;
}
