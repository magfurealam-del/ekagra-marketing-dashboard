// lib/metaCalc.ts
// Shared calculation helpers ported faithfully from the original vanilla-JS
// dashboard (getC, getCPR, getVid, getLeads, isActiveRunning, adType, fmt, etc).
// Kept framework-agnostic (no React) so both server routes and client
// components can import it.

export interface ActionValue {
  action_type?: string;
  indicator?: string;
  value?: string | number;
  values?: { value?: string | number }[];
}

export interface InsightRow {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  ctr?: string | number;
  cpm?: string | number;
  reach?: string | number;
  frequency?: string | number;
  actions?: ActionValue[];
  results?: ActionValue[];
  cost_per_result?: ActionValue[];
  date_start?: string;
  date_stop?: string;
  video_p25_watched_actions?: ActionValue[];
  video_p50_watched_actions?: ActionValue[];
  video_p75_watched_actions?: ActionValue[];
  video_p100_watched_actions?: ActionValue[];
  video_thruplay_watched_actions?: ActionValue[];
  [key: string]: unknown;
}

export interface Campaign extends InsightRow {
  id: string;
  name: string;
  status: string;
  objective: string;
  startTime: string;
  stopTime: string;
  type: AdType;
}

export interface AdType {
  k: string;
  l: string;
  e: string;
  c: string;
}

/** Conversations (messaging_conversation_started) from actions/results arrays. */
export function getC(row: InsightRow): number {
  const act = row.actions;
  if (Array.isArray(act)) {
    const a = act.find((x) => x.action_type?.includes("messaging_conversation_started"));
    if (a) return +(a.value ?? 0) || 0;
  }
  const res = row.results;
  if (Array.isArray(res)) {
    const a = res.find((x) => x.indicator?.includes("messaging_conversation_started"));
    if (a) return +(a.values?.[0]?.value ?? 0) || 0;
    return +(res[0]?.values?.[0]?.value ?? 0) || 0;
  }
  return 0;
}

/** Cost per result (conversation), preferring spend/convos, falling back to cost_per_result. */
export function getCPR(row: InsightRow): number {
  const c = getC(row);
  const sp = +(row.spend ?? 0) || 0;
  if (c > 0 && sp > 0) return sp / c;
  const arr = row.cost_per_result;
  if (Array.isArray(arr)) {
    const a = arr.find(
      (x) =>
        x.indicator?.includes("messaging_conversation_started") ||
        x.action_type?.includes("messaging_conversation_started")
    );
    if (a) return +(a.values?.[0]?.value ?? a.value ?? 0) || 0;
    return +(arr[0]?.values?.[0]?.value ?? arr[0]?.value ?? 0) || 0;
  }
  return 0;
}

/** Video watch count from a video_pXX_watched_actions array. */
export function getVid(f?: ActionValue[] | number | string): number {
  if (!f) return 0;
  if (Array.isArray(f)) {
    return +(f.find((x) => x.action_type?.includes("video"))?.value ?? f[0]?.value ?? 0) || 0;
  }
  return +f || 0;
}

/** Lead-type conversions (leadgen/pixel lead) from the actions array. */
export function getLeads(row: InsightRow): number {
  const act = row.actions;
  if (!Array.isArray(act)) return 0;
  return act
    .filter(
      (x) =>
        x.action_type === "lead" ||
        x.action_type?.includes("lead_grouped") ||
        x.action_type?.includes("offsite_conversion.fb_pixel_lead")
    )
    .reduce((s, x) => s + (+(x.value ?? 0) || 0), 0);
}

/** Is this campaign ACTIVE, spending, and not past its end date? */
export function isActiveRunning(a: Campaign): boolean {
  if (a.status !== "ACTIVE") return false;
  if ((+(a.spend ?? 0) || 0) <= 0) return false;
  if (a.stopTime && new Date(a.stopTime).getTime() < Date.now()) return false;
  return true;
}

export function fmtDate(d?: string): string {
  return d ? d.slice(0, 10) : "—";
}

/** Classify a campaign/ad by name into a content-type bucket. */
export function adType(name: string): AdType {
  const n = (name || "").toLowerCase();
  if (n.includes("ai generated") || n.includes("ai video")) return { k: "ai", l: "AI Video", e: "🤖", c: "p-ai" };
  if (n.includes("testimonial")) return { k: "testi", l: "Testimonial", e: "👤", c: "p-testi" };
  if (n.includes("hajj") || n.includes("pre-hajj") || n.includes("হজ্জ") || n.includes("ওমরাহ"))
    return { k: "seasonal", l: "Religious/Seasonal", e: "🕌", c: "p-seasonal" };
  if (n.includes("ramadan") || n.includes("রমজান")) return { k: "seasonal", l: "Ramadan", e: "🌙", c: "p-seasonal" };
  if (n.includes("wound") || n.includes("21feb") || n.includes("22feb") || n.includes("ক্ষত"))
    return { k: "wound", l: "Wound Care", e: "🩹", c: "p-wound" };
  if (n.includes("screening") || n.includes("dfu") || n.includes("package") || n.includes("assessment"))
    return { k: "pkg", l: "Screening/Package", e: "📦", c: "p-pkg" };
  if (n.includes("post:")) return { k: "post", l: "Boosted Post", e: "📢", c: "p-post" };
  if (
    n.includes("ইনজেকশন") ||
    n.includes("injection") ||
    n.includes("সুই") ||
    n.includes("dr.") ||
    n.includes("shawon")
  )
    return { k: "edu", l: "Educational", e: "💉", c: "p-edu" };
  return { k: "gen", l: "Video Ad", e: "🎬", c: "p-ai" };
}

/** Tailwind text-color class for a CPR value (green/amber/red thresholds). */
export function cprCls(v: number): string {
  return v === 0 ? "" : v < 0.2 ? "text-accent" : v < 0.45 ? "text-warn" : "text-danger2";
}

export type FmtType = "n" | "$" | "$0" | "%" | "big";

/** Generic number formatter mirroring the original fmt() helper. */
export function fmt(n: number | string | null | undefined, t: FmtType = "n"): string {
  if (n == null || isNaN(+n)) return "—";
  const v = parseFloat(String(n));
  if (t === "$") return "$" + v.toFixed(2);
  if (t === "$0") return "$" + Math.round(v).toLocaleString();
  if (t === "%") return v.toFixed(2) + "%";
  if (t === "big") return v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1000 ? Math.round(v / 1000) + "K" : v.toLocaleString();
  return v.toLocaleString();
}

export function fmtM(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/** Account/segment totals aggregated across a list of insight rows. */
export interface Totals {
  sp: number;
  im: number;
  cl: number;
  cv: number;
  rc: number;
  leads: number;
}

export function aggregate(rows: InsightRow[]): Totals {
  return rows.reduce<Totals>(
    (a, r) => ({
      sp: a.sp + (+(r.spend ?? 0) || 0),
      im: a.im + (+(r.impressions ?? 0) || 0),
      cl: a.cl + (+(r.clicks ?? 0) || 0),
      cv: a.cv + getC(r),
      rc: a.rc + (+(r.reach ?? 0) || 0),
      leads: a.leads + getLeads(r),
    }),
    { sp: 0, im: 0, cl: 0, cv: 0, rc: 0, leads: 0 }
  );
}

/** Simple grade bucket (A/B/C/D/X) from percent-efficiency-vs-average. */
export function gradeFromEff(eff: number | null): "A" | "B" | "C" | "D" | "X" {
  if (eff === null) return "X";
  if (eff > 40) return "A";
  if (eff > 15) return "B";
  if (eff > -20) return "C";
  return "D";
}

/** Rolling N-day average of a numeric series (simple trailing window). */
export function rollingAvg(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  return out;
}

/** Flags days where value > 2x the trailing 7-day average (anomaly detection). */
export interface Anomaly {
  index: number;
  value: number;
  avg: number;
  ratio: number;
}

export function detectAnomalies(values: number[], multiplier = 2, window = 7): Anomaly[] {
  const avgs = rollingAvg(values, window);
  const out: Anomaly[] = [];
  values.forEach((v, i) => {
    const avg = avgs[i];
    if (avg > 0 && v > avg * multiplier) {
      out.push({ index: i, value: v, avg, ratio: v / avg });
    }
  });
  return out;
}

/* ── FATIGUE (ported from renderFatigue in the original dashboard) ──
 * fScore = % change in CTR: last-7-day avg vs prior-7-day avg.
 * Needs >=14 days of daily data to compute; needs >=7 for "stable" fallback.
 * Thresholds (exact, do not change): <-30% high, <-15% medium, >10% growing, else stable. */
export type FatigueStatus = "high" | "medium" | "growing" | "stable" | "na";

export function classifyFatigue(fScore: number, dayCount: number): FatigueStatus {
  if (dayCount < 14) return dayCount >= 7 ? "stable" : "na";
  if (fScore < -30) return "high";
  if (fScore < -15) return "medium";
  if (fScore > 10) return "growing";
  return "stable";
}

/** Heatmap cell color for CTR-vs-this-ad's-own-average ratio (exact thresholds from original). */
export function heatClr(r: number): string {
  if (r > 1.6) return "#1D9E75";
  if (r > 1.2) return "#3AAA80";
  if (r > 0.85) return "#25393D";
  if (r > 0.6) return "#4A2525";
  return "#7A1515";
}
