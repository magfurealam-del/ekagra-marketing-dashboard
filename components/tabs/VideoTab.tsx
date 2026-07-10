"use client";

import { useState } from "react";
import { Card, DateRangePicker, ErrorBanner, Pill, SectionLabel, Spinner } from "@/components/ui";
import { useCampaigns, defaultRange } from "@/lib/useCampaigns";
import { cprCls, fmt, getCPR, getVid } from "@/lib/metaCalc";

const RETENTION_STAGES: [string, string, string][] = [
  ["25%", "video_p25_watched_actions", "#5ECBA1"],
  [">50%", "video_p50_watched_actions", "#78A8E0"],
  [">75%", "video_p75_watched_actions", "#EFB060"],
  [">100%", "video_p100_watched_actions", "#F08080"],
  ["Thruplay", "video_thruplay_watched_actions", "#C090F0"],
];

export default function VideoTab() {
  const [range, setRange] = useState(defaultRange());
  const { campaigns, loading, error } = useCampaigns(range);

  const ads = campaigns
    .filter((a) => getVid(a.video_p25_watched_actions) > 0)
    .sort((a, b) => (+b.spend! || 0) - (+a.spend! || 0));

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(since, until) => setRange({ since, until })} />
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner />
      ) : ads.length === 0 ? (
        <p className="py-5 text-muted2">No video data for this period.</p>
      ) : (
        <>
          <SectionLabel>Video retention funnels</SectionLabel>
          <p className="mb-3.5 text-xs text-muted2">
            <strong className="text-[#C8D5DF]">Hook Rate</strong> = % who watch past 25% ·{" "}
            <strong className="text-[#C8D5DF]">Completion</strong> = % of 25% viewers who finish ·{" "}
            <strong className="text-[#C8D5DF]">Thruplay</strong> = watched ≥15 sec
          </p>
          <div className="flex flex-col gap-3">
            {ads.map((a) => {
              const p25 = getVid(a.video_p25_watched_actions);
              const p50 = getVid(a.video_p50_watched_actions);
              const p75 = getVid(a.video_p75_watched_actions);
              const p100 = getVid(a.video_p100_watched_actions);
              const thru = getVid(a.video_thruplay_watched_actions);
              const imp = +a.impressions! || 1;
              const hook = ((p25 / imp) * 100).toFixed(1);
              const comp = p25 > 0 ? ((p100 / p25) * 100).toFixed(0) : "0";
              const drop50 = p25 > 0 ? (((p25 - p50) / p25) * 100).toFixed(0) : "0";
              const cpr = getCPR(a);
              const mx = p25 || 1;
              let health = "Average";
              let hclr = "text-warn";
              if (+hook > 8 && +comp > 20) {
                health = "Strong hook & completion";
                hclr = "text-accent";
              } else if (+hook < 3) {
                health = "Weak hook — most skip before 25%";
                hclr = "text-danger2";
              } else if (+drop50 > 60) {
                health = "High mid-video drop-off at 50%";
                hclr = "text-danger2";
              }
              return (
                <Card key={a.id}>
                  <div className="mb-3 flex items-start justify-between gap-2.5">
                    <div>
                      <div className="mb-1 text-[13px] font-semibold text-[#C8D5DF]" title={a.name}>
                        {a.name.length > 52 ? a.name.slice(0, 52) + "…" : a.name}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Pill className={a.type.c}>
                          {a.type.e} {a.type.l}
                        </Pill>
                        <Pill className={a.status === "ACTIVE" ? "p-a" : "p-p"}>{a.status}</Pill>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-3.5 text-center">
                      <MiniStat value={`$${parseFloat(String(a.spend)).toFixed(0)}`} label="spend" cls="text-text" />
                      <MiniStat value={`${hook}%`} label="hook rate" cls="text-warn" />
                      <MiniStat value={`${comp}%`} label="completion" cls="text-accent" />
                      <MiniStat value={`$${cpr.toFixed(2)}`} label="CPR" cls={cprCls(cpr)} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {RETENTION_STAGES.map(([label, key, color]) => {
                      const v = getVid((a as any)[key]);
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <div className="w-7 flex-shrink-0 text-right text-[9.5px] text-muted2">{label}</div>
                          <div className="h-[7px] flex-1 overflow-hidden rounded bg-bg">
                            <div
                              className="h-full rounded transition-all"
                              style={{ width: `${mx > 0 ? Math.round((v / mx) * 100) : 0}%`, background: color }}
                            />
                          </div>
                          <div className="w-10 text-right text-[9.5px] text-muted">{fmt(v, "big")}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-5 border-t border-border pt-2.5 text-[11px]">
                    <span>
                      <span className="text-muted2">Drop 25→50: </span>
                      <span className={+drop50 > 60 ? "text-danger2" : +drop50 > 40 ? "text-warn" : "text-accent"}>{drop50}%</span>
                    </span>
                    <span>
                      <span className="text-muted2">Impressions: </span>
                      <span className="text-[#C8D5DF]">{fmt(imp, "big")}</span>
                    </span>
                    <span>
                      <span className="text-muted2">Freq: </span>
                      <span className={+a.frequency! > 2.5 ? "text-danger2" : "text-[#C8D5DF]"}>{(+a.frequency! || 0).toFixed(2)}</span>
                    </span>
                    <span className={`ml-auto font-semibold ${hclr}`}>▸ {health}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ value, label, cls }: { value: string; label: string; cls?: string }) {
  return (
    <div>
      <div className={`text-[15px] font-bold ${cls}`}>{value}</div>
      <div className="text-[9.5px] text-muted2">{label}</div>
    </div>
  );
}
