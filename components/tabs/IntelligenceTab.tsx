"use client";

import { useMemo, useState } from "react";
import { Card, DateRangePicker, ErrorBanner, SectionLabel, Spinner } from "@/components/ui";
import { useCampaigns, useMonthly, defaultRange } from "@/lib/useCampaigns";
import { type Campaign, getC, gradeFromEff } from "@/lib/metaCalc";

interface TypeAgg {
  k: string;
  label: string;
  emoji: string;
  colorClass: string;
  sp: number;
  cv: number;
  cl: number;
  im: number;
  n: number;
  ads: Campaign[];
}

const AUCTION_DATA = [
  {
    name: "Proper Care & Time (Sothik Joton - 15feb26)",
    quality: "Below Average",
    engagement: "Above Average",
    conversion: "Above Average",
    diagnosis:
      "Quality ranking is in the bottom 35% of ads. Meta perceives this creative as low quality, which increases your auction costs. Improving creative quality (less text, higher resolution, no stock images) could lower CPR significantly without changing the message.",
    good: false,
  },
  {
    name: "Diabetic Patients Small Wound 13/06/26",
    quality: "Average",
    engagement: "Above Average",
    conversion: "Above Average",
    diagnosis: "Performing well. Above-average engagement and conversion rankings mean Meta shows this to more people at lower cost.",
    good: true,
  },
  {
    name: "Diabetic Foot Neuropathy Screening 07/06/26",
    quality: "Average",
    engagement: "Above Average",
    conversion: "Above Average",
    diagnosis: "Same strong signals as 13/06. Your newest creatives are outperforming your older high-spend ad on quality metrics.",
    good: true,
  },
  {
    name: "Diabetic Foot Neuropathy Screening 07/06/26 (v2)",
    quality: "Average",
    engagement: "Above Average",
    conversion: "Above Average",
    diagnosis: "Above average on all performance rankings. Healthy ad.",
    good: true,
  },
];

export default function IntelligenceTab() {
  const [range, setRange] = useState(defaultRange());
  const { campaigns, loading, error } = useCampaigns(range);
  const { monthly } = useMonthly(range);

  const ranked = useMemo(() => {
    const byK: Record<string, TypeAgg> = {};
    campaigns.forEach((a) => {
      const k = a.type.k;
      if (!byK[k]) byK[k] = { k, label: a.type.l, emoji: a.type.e, colorClass: a.type.c, sp: 0, cv: 0, cl: 0, im: 0, n: 0, ads: [] };
      byK[k].sp += +a.spend! || 0;
      byK[k].cv += getC(a);
      byK[k].cl += +a.clicks! || 0;
      byK[k].im += +a.impressions! || 0;
      byK[k].n++;
      byK[k].ads.push(a);
    });
    const tot = campaigns.reduce(
      (a, c) => ({ sp: a.sp + (+c.spend! || 0), cv: a.cv + getC(c), im: a.im + (+c.impressions! || 0), cl: a.cl + (+c.clicks! || 0) }),
      { sp: 0, cv: 0, im: 0, cl: 0 }
    );
    const avgCPR = tot.cv > 0 ? tot.sp / tot.cv : 0;
    const totalSp = tot.sp || 1;

    return Object.values(byK)
      .map((d) => {
        const cpr = d.cv > 0 ? d.sp / d.cv : 0;
        const ctr = d.im > 0 ? (d.cl / d.im) * 100 : 0;
        const eff = avgCPR > 0 && cpr > 0 ? ((avgCPR - cpr) / avgCPR) * 100 : null;
        const spShare = (d.sp / totalSp) * 100;
        return { ...d, cpr, ctr, eff, spShare, avgCPR };
      })
      .filter((x) => x.sp > 10)
      .sort((a, b) => {
        if (a.eff === null && b.eff === null) return 0;
        if (a.eff === null) return 1;
        if (b.eff === null) return -1;
        return b.eff - a.eff;
      });
  }, [campaigns]);

  const priorityActions = useMemo(() => {
    const list: { c: "g" | "w" | "b"; t: string; b: string }[] = [];
    const worst = ranked.find((x) => x.eff !== null && x.eff < -20 && x.spShare > 5);
    if (worst) {
      list.push({
        c: "b",
        t: `Reallocate budget from ${worst.label} (Grade D)`,
        b: `This format costs ${Math.abs(worst.eff!).toFixed(0)}% more per conversation than your average and consumes ${worst.spShare.toFixed(
          0
        )}% of total spend. Moving even half this budget to your Grade A format would meaningfully lower blended CPR.`,
      });
    }
    const best = ranked[0];
    if (best && best.eff !== null && best.eff > 30 && best.spShare < 20) {
      list.push({
        c: "g",
        t: `Scale up ${best.label} — your most efficient format`,
        b: `Grade A: ${best.eff.toFixed(0)}% cheaper per conversation than average at $${best.cpr.toFixed(2)} CPR. Currently only ${best.spShare.toFixed(
          0
        )}% of budget. Doubling this allocation is the single highest-ROI budget move available.`,
      });
    }
    const highFreq = campaigns
      .filter((a) => a.status === "ACTIVE" && +a.frequency! > 2.5)
      .sort((a, b) => +b.frequency! - +a.frequency!);
    if (highFreq.length) {
      list.push({
        c: "w",
        t: `${highFreq.length} campaign(s) with high frequency (>2.5)`,
        b: `${highFreq
          .map((a) => `"${(a.name || "").slice(0, 30)}" (freq: ${(+a.frequency!).toFixed(2)})`)
          .join(", ")}. High frequency means the same people see your ad repeatedly — once it exceeds 3.0 you typically see CTR decline. Refresh these creatives now.`,
      });
    }
    if (monthly.length >= 3) {
      const recent = monthly.slice(-2).map((r: any) => +r.ctr || 0);
      const early = monthly.slice(0, 2).map((r: any) => +r.ctr || 0);
      const rAvg = recent.reduce((s: number, v: number) => s + v, 0) / recent.length;
      const eAvg = early.reduce((s: number, v: number) => s + v, 0) / early.length;
      if (rAvg > eAvg * 1.2) {
        list.push({
          c: "g",
          t: `Account CTR improving — up ${((rAvg / eAvg - 1) * 100).toFixed(0)}% vs period start`,
          b: `Your most recent months are averaging ${rAvg.toFixed(2)}% CTR vs ${eAvg.toFixed(
            2
          )}% at the start of this period. This is a positive signal — your creative mix or targeting is improving. Keep the current direction.`,
        });
      } else if (rAvg < eAvg * 0.8) {
        list.push({
          c: "b",
          t: `Account CTR declining — down ${((1 - rAvg / eAvg) * 100).toFixed(0)}% vs period start`,
          b: `Recent months average ${rAvg.toFixed(2)}% CTR vs ${eAvg.toFixed(
            2
          )}% at period start. Account-wide CTR decline indicates audience fatigue across multiple campaigns. Review frequency, rotate creatives, and consider refreshing your targeting parameters.`,
        });
      }
    }
    return list;
  }, [ranked, campaigns, monthly]);

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(since, until) => setRange({ since, until })} />
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner />
      ) : (
        <>
          <SectionLabel>Content format efficiency — ranked by performance vs your own account average</SectionLabel>
          <p className="mb-3 text-xs text-muted2">
            Grades (A–D) are dynamic and based on your actual data. A = significantly above your account average CPR. D = significantly below.
          </p>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ranked.map((item) => {
              const grade = item.cv === 0 ? "X" : gradeFromEff(item.eff);
              let verdict = "";
              let vcls = "border-l-info";
              let body = "";
              let action = "";
              const activeCount = item.ads.filter((a) => a.status === "ACTIVE").length;
              const pausedCount = item.ads.filter((a) => a.status !== "ACTIVE").length;

              if (item.cpr === 0 || item.cv === 0) {
                verdict = "No conversions tracked";
                body = `${item.n} ad(s) spent $${item.sp.toFixed(0)} but generated no tracked messaging conversations. Verify the campaign objective / result definition.`;
                action = "Check campaign objective in Meta Ads Manager.";
                vcls = "border-l-info";
              } else if (item.eff === null) {
                verdict = "Cannot compare";
                body = "Insufficient data to benchmark against account average.";
                action = "Run for longer to generate reliable comparison data.";
                vcls = "border-l-info";
              } else if (item.eff > 40) {
                verdict = `🏆 ${item.eff.toFixed(0)}% cheaper than account average`;
                vcls = "border-l-accent";
                body = `This is your most efficient format. At $${item.cpr.toFixed(2)} CPR vs account average of $${item.avgCPR.toFixed(
                  2
                )}, every dollar generates ${(item.avgCPR / item.cpr).toFixed(1)}× more conversations. It receives ${item.spShare.toFixed(
                  0
                )}% of total spend${item.spShare < 20 ? " — likely under-resourced." : "."}`;
                action = `Scale spend on this format. ${activeCount} active ad(s), ${pausedCount} paused.`;
              } else if (item.eff > 15) {
                verdict = `✅ ${item.eff.toFixed(0)}% above account average`;
                vcls = "border-l-accent";
                body = `Above-average efficiency at $${item.cpr.toFixed(2)} CPR vs $${item.avgCPR.toFixed(2)} blended average. ${item.spShare.toFixed(
                  0
                )}% of total spend.`;
                action = "Maintain current investment; test new creative variations to push efficiency further.";
              } else if (item.eff > -20) {
                verdict = "→ Near account average performance";
                vcls = "border-l-warn";
                body = `CPR of $${item.cpr.toFixed(2)} is close to the account average of $${item.avgCPR.toFixed(2)}. ${item.spShare.toFixed(
                  0
                )}% of total spend (${item.n} ad(s)).`;
                action = "Test a new hook or CTA — the format has potential but execution isn't differentiating.";
              } else {
                verdict = `⚠ ${Math.abs(item.eff).toFixed(0)}% worse than account average`;
                vcls = "border-l-danger2";
                body = `CPR of $${item.cpr.toFixed(2)} is significantly above the $${item.avgCPR.toFixed(2)} account average, consuming ${item.spShare.toFixed(
                  0
                )}% of spend.`;
                action = `${activeCount} active ad(s). Pause the worst performers and redirect budget to Grade A/B formats.`;
              }

              return (
                <div key={item.k} className={`flex flex-col gap-2.5 rounded-card border border-l-[3px] border-border bg-card p-4 px-[18px] ${vcls}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`pill ${item.colorClass} mb-1 inline-block`}>
                        {item.emoji} {item.label}
                      </span>
                      <div className="text-[13px] font-semibold text-[#C8D5DF]">{verdict}</div>
                    </div>
                    <div className={`grade g${grade}`}>{grade}</div>
                  </div>
                  <div className="text-xs leading-relaxed text-muted">
                    {body}
                    <br />
                    <br />
                    <strong className="text-[#C8D5DF]">Action:</strong> {action}
                  </div>
                  <div className="flex flex-wrap gap-3.5 border-t border-border pt-2.5">
                    <IStat value={`$${item.sp.toFixed(0)}`} label="spend" />
                    <IStat value={String(item.cv)} label="convos" />
                    <IStat value={`$${item.cpr.toFixed(2)}`} label="CPR" />
                    <IStat value={`${item.ctr.toFixed(2)}%`} label="CTR" />
                    <IStat value={String(item.n)} label="ads" />
                  </div>
                </div>
              );
            })}
            {ranked.length === 0 && <p className="text-muted2">Not enough spend in this range to generate insights.</p>}
          </div>

          <SectionLabel>Priority actions — computed from live data</SectionLabel>
          <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {priorityActions.length ? (
              priorityActions.map((a, i) => (
                <div
                  key={i}
                  className={`rounded-card border border-l-[3px] border-border bg-card p-4 px-[18px] ${
                    a.c === "g" ? "border-l-accent" : a.c === "w" ? "border-l-warn" : "border-l-danger2"
                  }`}
                >
                  <div className="text-[13px] font-semibold text-[#C8D5DF]">{a.t}</div>
                  <div className="mt-1.5 text-xs leading-relaxed text-muted">{a.b}</div>
                </div>
              ))
            ) : (
              <div className="rounded-card border border-l-[3px] border-l-info border-border bg-card p-4 px-[18px]">
                <div className="text-[13px] font-semibold text-[#C8D5DF]">No urgent actions detected</div>
                <div className="mt-1.5 text-xs text-muted">
                  Account performance looks stable. Check back after refreshing data or widening the date range.
                </div>
              </div>
            )}
          </div>

          <SectionLabel>Auction quality audit — Meta&apos;s assessment of your ad creatives</SectionLabel>
          <p className="mb-3 text-xs text-muted2">
            Meta auction quality rankings — fetched live. Quality = how Meta rates your creative vs peers. Below Average raises your costs in
            the auction even if CTR is strong.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {AUCTION_DATA.map((a) => (
              <Card key={a.name} className={a.good ? "border-l-[3px] border-l-accent" : "border-l-[3px] border-l-warn"}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold text-[#C8D5DF]">{a.name}</div>
                    <div className="mt-1 text-[10.5px] text-muted2">Auction quality audit</div>
                  </div>
                  <div className="flex-shrink-0 space-y-0.5 text-right text-[9.5px]">
                    <div>
                      Quality:{" "}
                      <span
                        className={`font-bold ${
                          a.quality === "Below Average" ? "text-danger2" : a.quality === "Above Average" ? "text-accent" : "text-warn"
                        }`}
                      >
                        {a.quality}
                      </span>
                    </div>
                    <div>
                      Engagement: <span className="font-bold text-accent">{a.engagement}</span>
                    </div>
                    <div>
                      Conversion: <span className="font-bold text-accent">{a.conversion}</span>
                    </div>
                  </div>
                </div>
                <div className="text-[12px] leading-relaxed text-muted">{a.diagnosis}</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[15px] font-bold text-text">{value}</div>
      <div className="text-[9.5px] text-muted2">{label}</div>
    </div>
  );
}
