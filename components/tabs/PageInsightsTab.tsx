"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, LineChart,
} from "recharts";
import { Card, DateRangePicker, ErrorBanner, SectionLabel, Spinner } from "@/components/ui";
import { metaPageGet } from "@/lib/api";
import { daysAgoStr, todayStr } from "@/lib/metaCalc";
import { flattenScalarMetric, flattenBreakdownMetric, parsePosts, type TopPost } from "@/lib/pageInsights";

// ─── helpers ────────────────────────────────────────────────────────────────

function n(v: number | null | undefined, dp = 0): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(dp > 0 ? dp : 1) + "K";
  return v.toFixed(dp);
}
function pct(a: number, b: number): string {
  if (!b) return "—";
  return ((a / b) * 100).toFixed(1) + "%";
}
function ms2hm(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function sec2str(s: number): string {
  if (s < 60) return s.toFixed(0) + "s";
  return Math.floor(s / 60) + "m " + Math.round(s % 60) + "s";
}
function sum(arr: { value: number }[]): number {
  return arr.reduce((s, x) => s + x.value, 0);
}

// ─── sub-tab nav ─────────────────────────────────────────────────────────────

type Section = "overview" | "community" | "posts" | "videos" | "health";
const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: "overview",  label: "Overview",  emoji: "📊" },
  { id: "community", label: "Community", emoji: "🌊" },
  { id: "posts",     label: "Posts",     emoji: "📝" },
  { id: "videos",    label: "Videos",    emoji: "🎬" },
  { id: "health",    label: "Health",    emoji: "🔍" },
];

// ─── colour constants ─────────────────────────────────────────────────────────

const C = {
  paid:    "#6366F1",
  organic: "#10B981",
  unique:  "#38BDF8",
  accent:  "#38BDF8",
  green:   "#34D399",
  amber:   "#FBBF24",
  red:     "#F87171",
  purple:  "#C084FC",
  grid:    "rgba(255,255,255,.04)",
};
const TICK = { fontSize: 10, fill: "rgba(200,213,220,.4)" };
const TT   = { contentStyle: { background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 } };

const REACTION_COLORS: Record<string, string> = {
  like: "#38BDF8", love: "#F08080", wow: "#EFB060",
  haha: "#78A8E0", sorry: "#C090F0", anger: "#E24B4A",
};
const REACTION_EMOJI: Record<string, string> = {
  like: "👍", love: "❤️", wow: "😮", haha: "😂", sorry: "😢", anger: "😡",
};
const REACTION_KEYS = ["like", "love", "wow", "haha", "sorry", "anger"];
const REACTION_API_MAP: Record<string, string> = {
  REACTION_LIKE: "like", REACTION_LOVE: "love", REACTION_WOW: "wow",
  REACTION_HAHA: "haha", REACTION_SORRY: "sorry", REACTION_ANGER: "anger",
};

const VIDEO_COLORS = ["#6366F1","#38BDF8","#10B981","#F59E0B","#F87171","#C084FC","#2DD4BF","#FB923C"];

// ─── types ───────────────────────────────────────────────────────────────────

interface DaySeries { date: string; value: number }
interface LoadStatus { ok: boolean; error?: string }

interface VideoMeta {
  id: string;
  title?: string;
  description?: string;
  created_time: string;
  permalink_url?: string;
  length?: number; // seconds
}

// Reel-level insight data (from /{videoId}/video_insights endpoint)
interface ReelInsight {
  playCount: number;       // blue_reels_play_count — unique plays (1ms+, no replays)
  totalPlays: number;      // fb_reels_total_plays — total plays incl replays
  replayCount: number;     // fb_reels_replay_count
  reach: number;           // post_impressions_unique
  avgWatchMs: number;      // post_video_avg_time_watched
  totalViewTimeMs: number; // post_video_view_time
  follows: number;         // post_video_followers
  reactions: Record<string, number>;     // post_video_likes_by_reaction_type (keyed by REACTION_LIKE etc)
  socialActions: Record<string, number>; // post_video_social_actions (SHARE, COMMENT etc)
  // retention: keys = seconds (0,1,2…), values = fraction 0-1
  // stored normalized: positionPct (0-100) → retentionPct (0-100), using video.length
  retentionCurve: { positionPct: number; retentionPct: number }[];
}

// ─── reel insight parser ──────────────────────────────────────────────────────

function parseReelInsight(dataArr: any[], videoLengthSec = 0): ReelInsight {
  const by: Record<string, any> = {};
  (dataArr || []).forEach((m: any) => (by[m.name] = m));

  const scalar = (name: string): number => Number(by[name]?.values?.[0]?.value) || 0;
  const breakdown = (name: string): Record<string, number> => by[name]?.values?.[0]?.value || {};

  const retRaw: Record<string, number> = by["post_video_retention_graph"]?.values?.[0]?.value || {};
  const retentionCurve = Object.entries(retRaw)
    .map(([k, v]) => {
      const sec = parseInt(k);
      const positionPct = videoLengthSec > 0 ? Math.min((sec / videoLengthSec) * 100, 100) : sec;
      return { positionPct, retentionPct: Number(v) * 100 };
    })
    .sort((a, b) => a.positionPct - b.positionPct);

  return {
    playCount:      scalar("blue_reels_play_count"),
    totalPlays:     scalar("fb_reels_total_plays"),
    replayCount:    scalar("fb_reels_replay_count"),
    reach:          scalar("post_impressions_unique"),
    avgWatchMs:     scalar("post_video_avg_time_watched"),
    totalViewTimeMs:scalar("post_video_view_time"),
    follows:        scalar("post_video_followers"),
    reactions:      breakdown("post_video_likes_by_reaction_type"),
    socialActions:  breakdown("post_video_social_actions"),
    retentionCurve,
  };
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PageInsightsTab({ hasPage }: { hasPage: boolean }) {
  const [section, setSection] = useState<Section>("overview");
  const [range, setRange] = useState({ since: daysAgoStr(28), until: todayStr() });

  const [videoViews,        setVideoViews]        = useState<DaySeries[]>([]);
  const [videoViewsPaid,    setVideoViewsPaid]     = useState<DaySeries[]>([]);
  const [videoViewsOrganic, setVideoViewsOrganic]  = useState<DaySeries[]>([]);
  const [videoViewsUnique,  setVideoViewsUnique]   = useState<DaySeries[]>([]);
  const [videoRepeat,       setVideoRepeat]        = useState<DaySeries[]>([]);
  const [video30s,          setVideo30s]           = useState<DaySeries[]>([]);
  const [video30sPaid,      setVideo30sPaid]       = useState<DaySeries[]>([]);
  const [video30sOrganic,   setVideo30sOrganic]    = useState<DaySeries[]>([]);
  const [videoViewTime,     setVideoViewTime]      = useState<DaySeries[]>([]);
  const [engagement,        setEngagement]         = useState<DaySeries[]>([]);
  const [totalActionsSeries,setTotalActionsSeries] = useState<DaySeries[]>([]);
  const [reactions,         setReactions]          = useState<Record<string, number | string>[]>([]);
  const [follows,           setFollows]            = useState<DaySeries[]>([]);
  const [unfollows,         setUnfollows]          = useState<DaySeries[]>([]);
  const [pageViews,         setPageViews]          = useState<DaySeries[]>([]);
  const [fanCount,          setFanCount]           = useState<number | null>(null);
  const [posts,             setPosts]              = useState<TopPost[]>([]);
  const [videos,            setVideos]             = useState<VideoMeta[]>([]);
  const [reelInsights,      setReelInsights]       = useState<Record<string, ReelInsight>>({});

  const [statusVideo,    setStatusVideo]    = useState<LoadStatus | null>(null);
  const [statusEngage,   setStatusEngage]   = useState<LoadStatus | null>(null);
  const [statusAudience, setStatusAudience] = useState<LoadStatus | null>(null);
  const [statusViews,    setStatusViews]    = useState<LoadStatus | null>(null);
  const [statusPosts,    setStatusPosts]    = useState<LoadStatus | null>(null);
  const [statusVideoList,setStatusVideoList]= useState<LoadStatus | null>(null);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    if (!hasPage) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setStatusVideo(null); setStatusEngage(null); setStatusAudience(null);
    setStatusViews(null); setStatusPosts(null); setStatusVideoList(null);
    setReelInsights({});

    const { since, until } = range;

    const g1 = metaPageGet({
      metrics: [
        "page_video_views","page_video_views_paid","page_video_views_organic",
        "page_video_views_unique","page_video_repeat_views",
        "page_video_complete_views_30s","page_video_complete_views_30s_paid",
        "page_video_complete_views_30s_organic","page_video_view_time",
      ].join(","),
      since, until, period: "day",
    }).then((d: any) => {
      if (cancelled) return;
      const by: Record<string, any> = {};
      (d.data || []).forEach((m: any) => (by[m.name] = m));
      setVideoViews       (flattenScalarMetric(by["page_video_views"]));
      setVideoViewsPaid   (flattenScalarMetric(by["page_video_views_paid"]));
      setVideoViewsOrganic(flattenScalarMetric(by["page_video_views_organic"]));
      setVideoViewsUnique (flattenScalarMetric(by["page_video_views_unique"]));
      setVideoRepeat      (flattenScalarMetric(by["page_video_repeat_views"]));
      setVideo30s         (flattenScalarMetric(by["page_video_complete_views_30s"]));
      setVideo30sPaid     (flattenScalarMetric(by["page_video_complete_views_30s_paid"]));
      setVideo30sOrganic  (flattenScalarMetric(by["page_video_complete_views_30s_organic"]));
      setVideoViewTime    (flattenScalarMetric(by["page_video_view_time"]));
      setStatusVideo({ ok: true });
    }).catch((e: any) => { if (!cancelled) setStatusVideo({ ok: false, error: e?.message || String(e) }); });

    const g2 = metaPageGet({
      metrics: "page_post_engagements,page_actions_post_reactions_total,page_total_actions",
      since, until, period: "day",
    }).then((d: any) => {
      if (cancelled) return;
      const by: Record<string, any> = {};
      (d.data || []).forEach((m: any) => (by[m.name] = m));
      setEngagement         (flattenScalarMetric(by["page_post_engagements"]));
      setTotalActionsSeries (flattenScalarMetric(by["page_total_actions"]));
      setReactions          (flattenBreakdownMetric(by["page_actions_post_reactions_total"]));
      setStatusEngage({ ok: true });
    }).catch((e: any) => { if (!cancelled) setStatusEngage({ ok: false, error: e?.message || String(e) }); });

    const g3 = metaPageGet({
      metrics: "page_daily_follows_unique,page_daily_unfollows_unique",
      since, until, period: "day",
    }).then((d: any) => {
      if (cancelled) return;
      const by: Record<string, any> = {};
      (d.data || []).forEach((m: any) => (by[m.name] = m));
      setFollows  (flattenScalarMetric(by["page_daily_follows_unique"]));
      setUnfollows(flattenScalarMetric(by["page_daily_unfollows_unique"]));
      setStatusAudience({ ok: true });
    }).catch((e: any) => { if (!cancelled) setStatusAudience({ ok: false, error: e?.message || String(e) }); });

    const g4 = metaPageGet({
      metrics: "page_views_total", since, until, period: "day",
    }).then((d: any) => {
      if (cancelled) return;
      const by: Record<string, any> = {};
      (d.data || []).forEach((m: any) => (by[m.name] = m));
      setPageViews(flattenScalarMetric(by["page_views_total"]));
      setStatusViews({ ok: true });
    }).catch((e: any) => { if (!cancelled) setStatusViews({ ok: false, error: e?.message || String(e) }); });

    const g5 = Promise.all([
      metaPageGet({ path: "profile", fields: "fan_count" }).catch(() => ({})),
      metaPageGet({
        path: "published_posts",
        fields: "id,message,created_time,permalink_url,status_type,object_id,shares,reactions.limit(0).summary(true),comments.limit(0).summary(true)",
        limit: "50",
      }).catch(() => ({ data: [] })),
    ]).then(([profile, postsData]: any) => {
      if (cancelled) return;
      setFanCount(profile.fan_count ?? null);
      setPosts(parsePosts(postsData.data || []));
      setStatusPosts({ ok: true });
    }).catch((e: any) => { if (!cancelled) setStatusPosts({ ok: false, error: e?.message || String(e) }); });

    // g6: video list — fetch up to 20 reels, then immediately trigger per-reel insight fetch
    const g6 = metaPageGet({
      path: "videos",
      fields: "id,title,description,created_time,permalink_url,length",
      limit: "20",
    }).then(async (d: any) => {
      if (cancelled) return;
      const vids: VideoMeta[] = d.data || [];
      setVideos(vids);
      setStatusVideoList({ ok: true });

      // Fetch per-reel insights for top 10 reels
      const top = vids.slice(0, 10);
      const ALL_REEL = [
        "blue_reels_play_count","fb_reels_total_plays","fb_reels_replay_count",
        "post_video_avg_time_watched","post_video_view_time","post_impressions_unique",
        "post_video_social_actions","post_video_likes_by_reaction_type",
        "post_video_followers","post_video_retention_graph",
      ].join(",");

      await Promise.allSettled(
        top.map(async (v: VideoMeta) => {
          try {
            const rd: any = await metaPageGet({
              path: `video_insights/${v.id}`,
              metrics: ALL_REEL,
              period: "lifetime",
            });
            if (!cancelled) {
              const ins = parseReelInsight(rd.data || [], v.length || 0);
              setReelInsights((prev) => ({ ...prev, [v.id]: ins }));
            }
          } catch (_) { /* silent per-reel failure */ }
        })
      );
    }).catch((e: any) => { if (!cancelled) setStatusVideoList({ ok: false, error: e?.message || String(e) }); });

    Promise.allSettled([g1, g2, g3, g4, g5, g6]).then(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [hasPage, range.since, range.until]);

  // ── derived KPIs ─────────────────────────────────────────────────────────

  const totalViews     = sum(videoViews);
  const totalPaid      = sum(videoViewsPaid);
  const totalOrganic   = sum(videoViewsOrganic);
  const totalUnique    = sum(videoViewsUnique);
  const totalRepeat    = sum(videoRepeat);
  const total30s       = sum(video30s);
  const sum30sPaid     = sum(video30sPaid);
  const sum30sOrganic  = sum(video30sOrganic);
  const totalViewMs    = sum(videoViewTime);
  const totalEng       = sum(engagement);
  const totalFollows   = sum(follows);
  const totalUnfol     = sum(unfollows);
  const totalPgViews   = sum(pageViews);
  const netFollows     = totalFollows - totalUnfol;
  const hold30Rate     = totalViews ? (total30s / totalViews) * 100 : 0;
  const avgWatchSec    = totalViews ? totalViewMs / totalViews / 1000 : 0;
  const paidShare      = totalViews ? (totalPaid / totalViews) * 100 : 0;
  const orgShare       = totalViews ? (totalOrganic / totalViews) * 100 : 0;
  const repeatShare    = totalViews ? (totalRepeat / totalViews) * 100 : 0;
  const followRetention = totalFollows + totalUnfol > 0 ? totalFollows / (totalFollows + totalUnfol) : null;
  const unfollowPressure = totalFollows > 0 ? totalUnfol / totalFollows : null;

  const reactionTotals: Record<string, number> = {};
  reactions.forEach((r) => {
    REACTION_KEYS.forEach((k) => { reactionTotals[k] = (reactionTotals[k] || 0) + (Number(r[k]) || 0); });
  });
  const totalReactions = REACTION_KEYS.reduce((s, k) => s + (reactionTotals[k] || 0), 0);

  // ── reel aggregates across all fetched reels ──────────────────────────────

  const reelList = videos.filter((v) => reelInsights[v.id]);
  const totalReelPlays   = reelList.reduce((s, v) => s + reelInsights[v.id].playCount, 0);
  const totalReelReach   = reelList.reduce((s, v) => s + reelInsights[v.id].reach, 0);
  const totalReelReplays = reelList.reduce((s, v) => s + reelInsights[v.id].replayCount, 0);
  const totalReelFollows = reelList.reduce((s, v) => s + reelInsights[v.id].follows, 0);
  const avgReplayRate    = totalReelPlays > 0 ? (totalReelReplays / totalReelPlays) * 100 : 0;

  // Best reel by play count
  const bestReel = reelList.length > 0
    ? reelList.reduce((best, v) => reelInsights[v.id].playCount > reelInsights[best.id].playCount ? v : best)
    : null;

  // ── chart data ────────────────────────────────────────────────────────────

  const trendChart = videoViews.map((v, i) => ({
    date: v.date.slice(5), views: v.value,
    engagement: engagement[i]?.value ?? 0,
    follows: follows[i]?.value ?? 0,
  }));

  const paidOrgChart = videoViews.map((v, i) => ({
    date: v.date.slice(5),
    paid: videoViewsPaid[i]?.value ?? 0,
    organic: videoViewsOrganic[i]?.value ?? 0,
  }));

  const followChart = follows.map((f, i) => ({
    date: f.date.slice(5), follows: f.value,
    unfollows: -(unfollows[i]?.value ?? 0),
    net: f.value - (unfollows[i]?.value ?? 0),
  }));

  const reactionChart = reactions.map((r) => ({
    date: String(r.date).slice(5),
    ...REACTION_KEYS.reduce((a, k) => ({ ...a, [k]: Number(r[k] || 0) }), {}),
  }));

  // ── narrative ─────────────────────────────────────────────────────────────

  const narrative = useMemo(() => {
    const lines: { type: "winner"|"warning"|"opportunity"|"action"; text: string }[] = [];
    if (totalViews > 0) {
      if (paidShare > 90)
        lines.push({ type: "warning", text: `${paidShare.toFixed(0)}% of video views are paid. Organic discovery is minimal — test shorter hooks.` });
      else if (orgShare > 20)
        lines.push({ type: "winner", text: `Organic views represent ${orgShare.toFixed(0)}% of total — stronger than average for a promoted healthcare page.` });
    }
    if (hold30Rate > 15)
      lines.push({ type: "winner", text: `30-second hold rate of ${hold30Rate.toFixed(1)}% indicates strong early-video retention.` });
    else if (hold30Rate > 0 && hold30Rate < 8)
      lines.push({ type: "warning", text: `30-second hold rate is only ${hold30Rate.toFixed(1)}%. Test a faster opening that surfaces the clinical benefit within 5 seconds.` });
    if (netFollows > 0)
      lines.push({ type: "winner", text: `Net follower growth of +${netFollows.toLocaleString()} with a ${followRetention != null ? (followRetention * 100).toFixed(1) + "%" : "strong"} retention index.` });
    if (avgReplayRate > 20)
      lines.push({ type: "opportunity", text: `Reels average a ${avgReplayRate.toFixed(0)}% replay rate — content is being rewatched. Consider longer-form follow-up content.` });
    if (bestReel && reelInsights[bestReel.id]?.playCount > 0) {
      const ins = reelInsights[bestReel.id];
      const title = bestReel.title || bestReel.description?.slice(0, 40) || "Top reel";
      lines.push({ type: "winner", text: `"${title.slice(0, 50)}" led with ${n(ins.playCount)} plays and ${n(ins.reach)} reach.` });
    }
    if (lines.length === 0)
      lines.push({ type: "action", text: "Narrow the date range or verify credentials if metrics show zero. Signals will populate once data loads." });
    return lines;
  }, [totalViews, paidShare, orgShare, hold30Rate, netFollows, followRetention, avgReplayRate, bestReel, reelInsights]);

  const topPosts = [...posts].sort((a, b) => b.totalEngagement - a.totalEngagement).slice(0, 15);

  if (!hasPage) return (
    <Card>
      <p className="text-[12px] leading-relaxed text-muted">
        Add a Facebook Page ID and Page Access Token via <strong>⚙ Change credentials</strong> to unlock Page Insights.
      </p>
    </Card>
  );

  const errors = [statusVideo?.error, statusEngage?.error, statusAudience?.error, statusViews?.error, statusPosts?.error].filter(Boolean) as string[];
  const fatalError = errors.length >= 4 ? errors[0] : null;

  const sharedProps = {
    totalViews, totalPaid, totalOrganic, totalUnique, totalRepeat, total30s,
    sum30sPaid, sum30sOrganic, totalViewMs, totalEng, totalFollows, totalUnfol,
    netFollows, totalPgViews, hold30Rate, avgWatchSec, paidShare, orgShare,
    repeatShare, fanCount, totalReactions, reactionTotals, followRetention,
    unfollowPressure, trendChart, paidOrgChart, followChart, reactionChart,
    narrative, topPosts, pageViews, follows, unfollows,
    // reel aggregates for Overview
    reelList, totalReelPlays, totalReelReach, totalReelReplays, avgReplayRate,
    totalReelFollows, bestReel, reelInsights,
  };

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(s, u) => setRange({ since: s, until: u })} />

      <nav className="mb-4 flex gap-0.5 overflow-x-auto rounded-card bg-[#0D1825] p-0.5">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex-shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-[12px] font-semibold transition-colors ${
              section === s.id ? "bg-[#1A2D42] text-[#C8D5DF]" : "text-[#4A6A7A] hover:text-[#8AABBA]"
            }`}>
            {s.emoji} {s.label}
          </button>
        ))}
      </nav>

      {fatalError && <ErrorBanner message={fatalError} />}

      {loading ? <Spinner label="Loading Page Insights…" /> : (
        <>
          {section === "overview"  && <OverviewSection  {...sharedProps} />}
          {section === "community" && <CommunitySection {...sharedProps} />}
          {section === "posts"     && <PostsSection topPosts={topPosts} />}
          {section === "videos"    && <VideosSection {...sharedProps} videos={videos} statusVideoList={statusVideoList} />}
          {section === "health"    && <HealthSection statusVideo={statusVideo} statusEngage={statusEngage} statusAudience={statusAudience} statusViews={statusViews} statusPosts={statusPosts} statusVideoList={statusVideoList} range={range} totalViews={totalViews} totalEng={totalEng} totalFollows={totalFollows} postsCount={posts.length} videoCount={videos.length} reelCount={reelList.length} />}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SHARED PRIMITIVES
// ══════════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted2">{label}</div>
      <div className={`text-2xl font-bold leading-none tracking-tight ${color || "text-text"}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-muted2">{sub}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — EXECUTIVE OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════

function OverviewSection({ totalViews, totalUnique, avgWatchSec, hold30Rate, totalEng, netFollows, totalPgViews, total30s, totalPaid, totalOrganic, totalRepeat, paidShare, orgShare, repeatShare, fanCount, totalReactions, reactionTotals, trendChart, paidOrgChart, narrative, reelList, totalReelPlays, totalReelReach, totalReelReplays, avgReplayRate, totalReelFollows, bestReel, reelInsights }: any) {
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="Video Views (page)"  value={n(totalViews)}        sub={`${n(totalUnique)} unique viewers`} color="text-[#38BDF8]" />
        <KpiCard label="Avg Watch Time"       value={avgWatchSec > 0 ? avgWatchSec.toFixed(0) + "s" : "—"} sub="Per view (page)" />
        <KpiCard label="30s Hold Rate"        value={hold30Rate > 0 ? hold30Rate.toFixed(1) + "%" : "—"} sub={`${n(total30s)} reached 30s`} color={hold30Rate > 15 ? "text-[#34D399]" : "text-text"} />
        <KpiCard label="Post Engagements"     value={n(totalEng)} sub="Likes, comments, shares" />
        <KpiCard label="Net Follows"          value={(netFollows >= 0 ? "+" : "") + n(netFollows)} color={netFollows >= 0 ? "text-[#34D399]" : "text-[#F87171]"} sub="Follows minus unfollows" />
        <KpiCard label="Page Followers"       value={fanCount != null ? n(fanCount) : "—"} sub="Current total" />
        <KpiCard label="Page Views"           value={n(totalPgViews)} sub="Visits to Page profile" />
        <KpiCard label="Total Reactions"      value={n(totalReactions)} sub={`${pct(reactionTotals["like"] || 0, totalReactions)} likes`} />
      </div>

      {/* Reel aggregate strip — shown if per-reel data is available */}
      {reelList.length > 0 && (
        <>
          <SectionLabel>Reel Performance (per-reel data — {reelList.length} reels)</SectionLabel>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <KpiCard label="Total Reel Plays" value={n(totalReelPlays)} sub="Unique plays" color="text-[#6366F1]" />
            <KpiCard label="Reel Reach"       value={n(totalReelReach)} sub="Unique viewers" color="text-[#38BDF8]" />
            <KpiCard label="Replays"          value={n(totalReelReplays)} sub={`${avgReplayRate.toFixed(0)}% replay rate`} color="text-[#C084FC]" />
            <KpiCard label="Follows from Reels" value={"+" + n(totalReelFollows)} sub="Within 24h of watch" color="text-[#34D399]" />
            {bestReel && reelInsights[bestReel.id] && (
              <div className="rounded-card border border-[#6366F1]/30 bg-[#0D1030] p-4">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#8A9ADE]">Top Reel</div>
                <div className="text-lg font-bold text-[#6366F1]">{n(reelInsights[bestReel.id].playCount)} plays</div>
                <div className="mt-0.5 text-[10px] text-muted2 overflow-hidden text-ellipsis whitespace-nowrap" title={bestReel.title || bestReel.description}>
                  {(bestReel.title || bestReel.description || "").slice(0, 35) || bestReel.created_time.slice(0, 10)}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          { label: "Paid View Share",    value: paidShare,   count: totalPaid,    color: "#6366F1" },
          { label: "Organic View Share", value: orgShare,    count: totalOrganic,  color: "#10B981" },
          { label: "Repeat-View Share",  value: repeatShare, count: totalRepeat,   color: "#F59E0B" },
        ].map(({ label, value, count, color }) => (
          <div key={label} className="rounded-card border border-border bg-card p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted2">{label}</div>
            <div className="text-2xl font-bold" style={{ color }}>{value.toFixed(1)}%</div>
            <div className="mt-1 text-[11px] text-muted2">{n(count)} views</div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#1A2535]">
              <div className="h-full rounded-full transition-all" style={{ width: value + "%", background: color }} />
            </div>
          </div>
        ))}
      </div>

      <SectionLabel>30-Day Performance Pulse</SectionLabel>
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <Card title="Video views, engagement and follows — daily">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendChart}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="date" tick={TICK} />
                <YAxis yAxisId="l" tick={TICK} />
                <YAxis yAxisId="r" orientation="right" tick={TICK} />
                <Tooltip {...TT} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar  yAxisId="l" dataKey="views"      name="Video views"  fill={C.paid}   opacity={0.7} radius={[2,2,0,0]} />
                <Line yAxisId="r" dataKey="engagement" name="Engagements"  stroke={C.accent} strokeWidth={2} dot={false} />
                <Line yAxisId="r" dataKey="follows"    name="New follows"  stroke={C.green}  strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Paid vs organic — daily stacked area">
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={paidOrgChart}>
                <defs>
                  <linearGradient id="gPaid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.paid} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={C.paid} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOrg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.organic} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={C.organic} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="date" tick={TICK} />
                <YAxis tick={TICK} />
                <Tooltip {...TT} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="paid"    name="Paid"    stroke={C.paid}    fill="url(#gPaid)" strokeWidth={2} stackId="a" />
                <Area type="monotone" dataKey="organic" name="Organic" stroke={C.organic} fill="url(#gOrg)"  strokeWidth={2} stackId="a" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <SectionLabel>Automated Executive Narrative</SectionLabel>
      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        {narrative.map((item: any, i: number) => {
          const s: Record<string, string> = {
            winner:      "border-[#34D399] bg-[#052E1C] text-[#34D399]",
            warning:     "border-[#F59E0B] bg-[#2D1F04] text-[#FBBF24]",
            opportunity: "border-[#38BDF8] bg-[#0C2D3F] text-[#38BDF8]",
            action:      "border-[#8A98AE] bg-[#1A2535] text-[#8A98AE]",
          };
          const labels: Record<string, string> = { winner: "Winner", warning: "Watch", opportunity: "Opportunity", action: "Action" };
          return (
            <div key={i} className={`rounded-card border p-3 px-4 ${s[item.type]}`}>
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest opacity-70">{labels[item.type]}</div>
              <div className="text-[12px] leading-relaxed">{item.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — COMMUNITY HEALTH
// ══════════════════════════════════════════════════════════════════════════════

function CommunitySection({ follows, unfollows, followChart, reactionChart, reactionTotals, pageViews, netFollows, totalFollows, totalUnfol, totalReactions, followRetention, unfollowPressure }: any) {
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="New Follows"       value={"+" + n(totalFollows)} color="text-[#34D399]" />
        <KpiCard label="Unfollows"         value={"-" + n(totalUnfol)}   color="text-[#F87171]" />
        <KpiCard label="Net Follows"       value={(netFollows >= 0 ? "+" : "") + n(netFollows)} color={netFollows >= 0 ? "text-[#34D399]" : "text-[#F87171]"} />
        <KpiCard label="Retention Index"   value={followRetention != null ? (followRetention * 100).toFixed(1) + "%" : "—"} sub="Follows ÷ (follows + unfollows)" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <KpiCard label="Unfollow Pressure" value={unfollowPressure != null ? (unfollowPressure * 100).toFixed(1) + "%" : "—"} sub="Unfollows ÷ follows" />
        <KpiCard label="Page Views"        value={n(sum(pageViews))} sub="Visits to Page profile" />
      </div>

      <SectionLabel>Follow / Unfollow Tide — Daily Diverging</SectionLabel>
      <Card className="mb-3">
        <p className="mb-2 text-[11px] text-muted2">Bars above zero = new followers. Bars below = unfollows. Line = rolling net.</p>
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={followChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="date" tick={TICK} />
              <YAxis tick={TICK} />
              <ReferenceLine y={0} stroke="rgba(200,213,220,.25)" />
              <Tooltip {...TT} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar  dataKey="follows"   name="New follows" fill={C.green} radius={[2,2,0,0]} />
              <Bar  dataKey="unfollows" name="Unfollows"   fill={C.red}   radius={[0,0,2,2]} />
              <Line dataKey="net"       name="Net"         stroke={C.accent} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <SectionLabel>Reaction Weather Map</SectionLabel>
      <Card className="mb-3">
        <div className="mb-4 flex flex-wrap gap-5">
          {REACTION_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="text-base">{REACTION_EMOJI[k]}</span>
              <span className="text-sm font-bold text-text">{n(reactionTotals[k] || 0)}</span>
              <span className="text-[10px] text-muted2">{pct(reactionTotals[k] || 0, totalReactions)}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={reactionChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="date" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip {...TT} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {REACTION_KEYS.map((k) => <Bar key={k} dataKey={k} stackId="r" fill={REACTION_COLORS[k]} name={k} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <SectionLabel>Page Visit Trend</SectionLabel>
      <Card className="mb-3">
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pageViews.map((v: any) => ({ date: v.date.slice(5), visits: v.value }))}>
              <defs>
                <linearGradient id="gPV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="date" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip {...TT} />
              <Area type="monotone" dataKey="visits" name="Page visits" stroke={C.accent} fill="url(#gPV)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — POST PERFORMANCE
// ══════════════════════════════════════════════════════════════════════════════

function PostsSection({ topPosts }: { topPosts: TopPost[] }) {
  const totalInteractions = topPosts.reduce((s, p) => s + p.totalEngagement, 0);
  const totalShares       = topPosts.reduce((s, p) => s + p.shares, 0);
  const totalComments     = topPosts.reduce((s, p) => s + p.comments, 0);

  return (
    <div>
      <div className="mb-3 rounded-card border border-[#F59E0B]/30 bg-[#2D1F04] px-4 py-2.5 text-[12px] text-[#FBBF24]">
        ⚠ Non-video post impression and reach metrics are not in the validated API set.
        Performance is measured using <strong>interactions</strong> (reactions + comments + shares), not exposure-based rates.
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <KpiCard label="Total Interactions"    value={n(totalInteractions)} sub={`${topPosts.length} posts`} />
        <KpiCard label="Amplification (Shares)" value={n(totalShares)} sub={totalInteractions ? pct(totalShares, totalInteractions) + " of interactions" : undefined} />
        <KpiCard label="Conversation (Comments)" value={n(totalComments)} sub={totalInteractions ? pct(totalComments, totalInteractions) + " of interactions" : undefined} />
      </div>

      <SectionLabel>Post Interaction Leaderboard</SectionLabel>
      <Card className="mb-3 overflow-x-auto">
        <table className="dt w-full">
          <thead>
            <tr>
              <th>#</th><th>Date</th><th>Post</th>
              <th className="text-right">Reactions</th><th className="text-right">Comments</th>
              <th className="text-right">Shares</th><th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {topPosts.map((p, i) => (
              <tr key={p.id}>
                <td className="text-muted2">{i + 1}</td>
                <td className="text-muted2">{p.created_time.slice(0, 10)}</td>
                <td className="max-w-[280px] overflow-hidden text-ellipsis" title={p.message}>
                  {p.permalink_url
                    ? <a href={p.permalink_url} target="_blank" rel="noopener noreferrer" className="border-b border-dashed border-accent/40 text-[#C8D5DF] no-underline">{p.message.slice(0, 75)}</a>
                    : p.message.slice(0, 75)}
                </td>
                <td className="text-right">{p.likes.toLocaleString()}</td>
                <td className="text-right">{p.comments.toLocaleString()}</td>
                <td className="text-right">{p.shares.toLocaleString()}</td>
                <td className="text-right font-bold text-text">{p.totalEngagement.toLocaleString()}</td>
              </tr>
            ))}
            {topPosts.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-muted2">No posts found for this Page.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {topPosts.length > 0 && (
        <>
          <SectionLabel>Interaction Composition — Top 10 Posts</SectionLabel>
          <Card className="mb-3">
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart layout="vertical" data={topPosts.slice(0, 10).map((p) => ({
                  name: p.message.slice(0, 28) + "…",
                  reactions: p.likes, comments: p.comments, shares: p.shares,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={TICK} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9, fill: "rgba(200,213,220,.4)" }} />
                  <Tooltip {...TT} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="reactions" name="Reactions" stackId="s" fill={C.accent}  />
                  <Bar dataKey="comments"  name="Comments"  stackId="s" fill={C.organic} />
                  <Bar dataKey="shares"    name="Shares"    stackId="s" fill={C.amber} radius={[0,2,2,0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — VIDEO / REEL PERFORMANCE
// ══════════════════════════════════════════════════════════════════════════════

function retentionColor(val: number): string {
  if (val >= 75) return "#10B981";
  if (val >= 50) return "#34D399";
  if (val >= 35) return "#FBBF24";
  if (val >= 20) return "#F59E0B";
  return "#F87171";
}

function AudienceRiver({ totalViews, totalUnique, total30s, sum30sPaid, sum30sOrganic }: any) {
  const stages = [
    { label: "Total Views (3s+)", value: totalViews,    color: "#6366F1", pct: 100 },
    { label: "Unique Viewers",    value: totalUnique,   color: "#38BDF8", pct: totalViews ? (totalUnique / totalViews) * 100 : 0 },
    { label: "30-Second Views",   value: total30s,      color: "#10B981", pct: totalViews ? (total30s / totalViews) * 100 : 0 },
    { label: "└ Paid 30s",        value: sum30sPaid,    color: "#818CF8", pct: totalViews ? (sum30sPaid / totalViews) * 100 : 0 },
    { label: "└ Organic 30s",     value: sum30sOrganic, color: "#34D399", pct: totalViews ? (sum30sOrganic / totalViews) * 100 : 0 },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {stages.map((s, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-36 shrink-0 text-right text-[11px] text-muted2">{s.label}</div>
          <div className="relative flex h-7 flex-1 overflow-hidden rounded-sm bg-[#111B28]">
            <div className="flex h-full items-center rounded-sm pl-2 transition-all duration-700"
              style={{ width: Math.max(s.pct, 0.3) + "%", background: s.color, opacity: i > 2 ? 0.75 : 1 }}>
              <span className="text-[10px] font-bold text-white whitespace-nowrap">{s.value.toLocaleString()}</span>
            </div>
          </div>
          <div className="w-12 shrink-0 text-right text-[11px] font-bold" style={{ color: s.color }}>
            {s.pct > 0 ? s.pct.toFixed(1) + "%" : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// Heatmap: normalized retention at key video positions
function WatchDepthHeatmap({ videos, insights }: { videos: VideoMeta[]; insights: Record<string, ReelInsight> }) {
  const COLS = [0, 10, 25, 50, 75, 90, 100];

  const getRetAt = (curve: { positionPct: number; retentionPct: number }[], targetPct: number): number | null => {
    if (!curve.length) return null;
    const exact = curve.find((p) => Math.abs(p.positionPct - targetPct) < 0.5);
    if (exact) return exact.retentionPct;
    const before = curve.filter((p) => p.positionPct <= targetPct).at(-1);
    const after  = curve.find((p) => p.positionPct >= targetPct);
    if (!before && !after) return null;
    if (!before) return after!.retentionPct;
    if (!after)  return before.retentionPct;
    if (before === after) return before.retentionPct;
    const t = (targetPct - before.positionPct) / (after.positionPct - before.positionPct);
    return before.retentionPct + t * (after.retentionPct - before.retentionPct);
  };

  const rows = videos.filter((v) => insights[v.id] && insights[v.id].retentionCurve.length > 0);
  const noRetRows = videos.filter((v) => insights[v.id] && insights[v.id].retentionCurve.length === 0);

  if (!videos.filter((v) => insights[v.id]).length) return (
    <p className="py-6 text-center text-[12px] text-muted2">Loading reel data…</p>
  );

  return (
    <>
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "rgba(200,213,220,.4)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,.06)" }}>Reel</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "rgba(200,213,220,.4)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,.06)" }}>Plays</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "rgba(200,213,220,.4)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,.06)" }}>Avg Watch</th>
                {COLS.map((c) => (
                  <th key={c} style={{ textAlign: "center", padding: "6px 4px", color: "rgba(200,213,220,.4)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,.06)", minWidth: 42 }}>{c}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((v, idx) => {
                const ins = insights[v.id];
                const title = v.title || v.description?.slice(0, 40) || `Reel ${idx + 1}`;
                return (
                  <tr key={v.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <td style={{ padding: "6px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.permalink_url
                        ? <a href={v.permalink_url} target="_blank" rel="noopener noreferrer" style={{ color: "#C8D5DF", textDecoration: "none", borderBottom: "1px dashed rgba(56,189,248,.4)" }}>{title}</a>
                        : <span style={{ color: "#C8D5DF" }}>{title}</span>
                      }
                      <span style={{ color: "rgba(200,213,220,.35)", marginLeft: 6 }}>{v.created_time.slice(0, 10)}</span>
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", color: "#C8D5DF" }}>{n(ins.playCount)}</td>
                    <td style={{ textAlign: "right", padding: "6px 8px", color: "#C8D5DF" }}>{ins.avgWatchMs > 0 ? sec2str(ins.avgWatchMs / 1000) : "—"}</td>
                    {COLS.map((c) => {
                      const val = getRetAt(ins.retentionCurve, c);
                      const clr = val != null ? retentionColor(val) : "rgba(200,213,220,.15)";
                      return (
                        <td key={c} style={{ textAlign: "center", padding: "6px 4px" }}>
                          <span style={{ display: "inline-block", minWidth: 38, padding: "2px 4px", borderRadius: 4, background: val != null ? clr + "22" : "transparent", color: clr, fontWeight: 700, fontSize: 10 }}>
                            {val != null ? val.toFixed(0) + "%" : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-4 text-center text-[12px] text-muted2">
          Retention data not yet available — reels need sufficient view volume for Meta to compute this metric.
        </p>
      )}
      {noRetRows.length > 0 && (
        <p className="mt-2 text-[11px] text-muted2">
          {noRetRows.length} reel(s) loaded without retention data (likely too new or insufficient views).
        </p>
      )}
    </>
  );
}

function VideosSection({ totalViews, totalPaid, totalOrganic, totalUnique, totalRepeat, total30s, sum30sPaid, sum30sOrganic, totalViewMs, avgWatchSec, hold30Rate, paidShare, orgShare, paidOrgChart, videos, statusVideoList, reelInsights, reelList }: any) {
  const repeatProxy = totalViews && totalUnique ? ((totalViews - totalUnique) / totalViews) * 100 : 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first reel with insight data
  useEffect(() => {
    if (selectedId) return;
    const first = (videos as VideoMeta[]).find((v: VideoMeta) => reelInsights[v.id]);
    if (first) setSelectedId(first.id);
  }, [reelInsights, videos, selectedId]);

  const selectedReel   = selectedId ? (videos as VideoMeta[]).find((v: VideoMeta) => v.id === selectedId) : null;
  const selectedInsight: ReelInsight | null = selectedId ? reelInsights[selectedId] ?? null : null;

  // Overlaid retention chart data
  const retentionChartData = useMemo(() => {
    const vl = (videos as VideoMeta[]).filter((v: VideoMeta) => reelInsights[v.id]?.retentionCurve?.length > 0).slice(0, 8);
    if (!vl.length) return [];
    // Sample at every 5% of video
    return Array.from({ length: 21 }, (_, i) => i * 5).map((p) => {
      const row: Record<string, any> = { pos: p + "%" };
      vl.forEach((v: VideoMeta, i: number) => {
        const curve = reelInsights[v.id].retentionCurve;
        const before = curve.filter((c: any) => c.positionPct <= p).at(-1);
        const after  = curve.find((c: any) => c.positionPct >= p);
        if (before && after && before !== after) {
          const t = (p - before.positionPct) / (after.positionPct - before.positionPct);
          row[`v${i}`] = before.retentionPct + t * (after.retentionPct - before.retentionPct);
        } else if (before || after) {
          row[`v${i}`] = (before || after)!.retentionPct;
        }
      });
      return row;
    });
  }, [videos, reelInsights]);

  const reelsWithData = (videos as VideoMeta[]).filter((v: VideoMeta) => reelInsights[v.id]);

  // Reel leaderboard: sort by play count
  const reelLeaderboard = [...reelsWithData].sort((a, b) =>
    (reelInsights[b.id]?.playCount ?? 0) - (reelInsights[a.id]?.playCount ?? 0)
  );

  return (
    <div>
      {/* ── Page-level aggregate KPIs ── */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="Total Views (3s+)"  value={n(totalViews)}                           color="text-[#6366F1]" />
        <KpiCard label="Unique Viewers"     value={n(totalUnique)}                           sub={pct(totalUnique, totalViews) + " of views"} />
        <KpiCard label="30s Hold Rate"      value={hold30Rate.toFixed(1) + "%"}              color={hold30Rate > 15 ? "text-[#34D399]" : "text-text"} sub={n(total30s) + " reached 30s"} />
        <KpiCard label="Avg Watch / View"   value={avgWatchSec > 0 ? avgWatchSec.toFixed(1) + "s" : "—"} sub={ms2hm(totalViewMs) + " total"} />
      </div>

      <SectionLabel>The Audience River — Watch-Depth Funnel</SectionLabel>
      <Card className="mb-3">
        <p className="mb-4 text-[11px] text-muted2">Width represents share of total 3s+ views (page-level aggregate).</p>
        <AudienceRiver {...{ totalViews, totalUnique, total30s, sum30sPaid, sum30sOrganic }} />
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
          {[
            { label: "Paid View Share",    v: paidShare,    count: totalPaid,    color: "#6366F1" },
            { label: "Organic View Share", v: orgShare,     count: totalOrganic,  color: "#10B981" },
            { label: "Repeat-View Proxy",  v: repeatProxy,  count: totalRepeat,   color: "#F59E0B" },
          ].map(({ label, v, count, color }) => (
            <div key={label}>
              <div className="text-[10px] font-bold uppercase text-muted2">{label}</div>
              <div className="mt-1 text-lg font-bold" style={{ color }}>{v.toFixed(1)}%</div>
              <div className="text-[11px] text-muted2">{n(count)} views</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionLabel>Paid vs Organic Distribution — Daily</SectionLabel>
      <Card className="mb-3">
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={paidOrgChart}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="date" tick={TICK} />
              <YAxis tick={TICK} />
              <Tooltip {...TT} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="paid"    name="Paid"    fill={C.paid}    stackId="v" />
              <Bar dataKey="organic" name="Organic" fill={C.organic} stackId="v" radius={[2,2,0,0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ── Per-reel section ── */}
      {statusVideoList && !statusVideoList.ok ? (
        <div className="mb-3 rounded-card border border-[#F87171]/30 bg-[#2D0F0F] px-4 py-3 text-[12px] text-[#F87171]">
          ✗ Could not load reel list: {statusVideoList.error}
        </div>
      ) : (
        <>
          {/* Reel selector */}
          {reelsWithData.length > 0 && (
            <>
              <SectionLabel>Per-Reel Deep Dive</SectionLabel>
              <div className="mb-3 flex flex-wrap gap-1">
                {reelsWithData.map((v: VideoMeta, i: number) => {
                  const title = v.title || v.description?.slice(0, 24) || `Reel ${i + 1}`;
                  return (
                    <button key={v.id} onClick={() => setSelectedId(v.id)}
                      className={`rounded px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        selectedId === v.id ? "text-white" : "bg-[#111B28] text-muted2 hover:text-text"
                      }`}
                      style={selectedId === v.id ? { background: VIDEO_COLORS[i % VIDEO_COLORS.length] } : {}}>
                      {title.slice(0, 28)}{title.length > 28 ? "…" : ""}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Selected reel detail */}
          {selectedInsight && selectedReel && (
            <Card className="mb-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-text">
                  {selectedReel.title || selectedReel.description?.slice(0, 60) || "Selected Reel"}
                </span>
                {selectedReel.length && (
                  <span className="rounded bg-[#1A2535] px-2 py-0.5 text-[10px] text-muted2">{sec2str(selectedReel.length)} duration</span>
                )}
                {selectedReel.permalink_url && (
                  <a href={selectedReel.permalink_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#38BDF8] underline">View on Facebook ↗</a>
                )}
                <span className="text-[10px] text-muted2">{selectedReel.created_time.slice(0, 10)}</span>
              </div>

              {/* KPI row */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KpiCard label="Plays (unique)"  value={n(selectedInsight.playCount)}  color="text-[#6366F1]" sub={`${n(selectedInsight.reach)} reached`} />
                <KpiCard label="Total Plays"     value={n(selectedInsight.totalPlays)} sub={`${n(selectedInsight.replayCount)} replays (${selectedInsight.playCount > 0 ? ((selectedInsight.replayCount / selectedInsight.playCount) * 100).toFixed(0) : "—"}%)`} color="text-[#C084FC]" />
                <KpiCard label="Avg Watch Time"  value={selectedInsight.avgWatchMs > 0 ? sec2str(selectedInsight.avgWatchMs / 1000) : "—"} sub={selectedReel.length ? `of ${sec2str(selectedReel.length)} (${((selectedInsight.avgWatchMs / 1000) / selectedReel.length * 100).toFixed(0)}% watched)` : undefined} />
                <KpiCard label="Total Watch"     value={ms2hm(selectedInsight.totalViewTimeMs)} sub="Cumulative" />
              </div>

              {/* Engagement row */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(() => {
                  const reactions = Object.entries(selectedInsight.reactions).reduce((acc, [k, v]) => {
                    const key = REACTION_API_MAP[k] || k.toLowerCase();
                    acc[key] = (acc[key] || 0) + Number(v);
                    return acc;
                  }, {} as Record<string, number>);
                  const totalRxn = Object.values(reactions).reduce((s, v) => s + v, 0);
                  const shares = selectedInsight.socialActions["SHARE"] || 0;
                  const comments = selectedInsight.socialActions["COMMENT"] || 0;
                  return (
                    <>
                      <KpiCard label="Reactions" value={n(totalRxn)} sub={Object.entries(reactions).map(([k, v]) => `${REACTION_EMOJI[k] || k} ${v}`).join("  ")} />
                      <KpiCard label="Shares"    value={n(shares)} color="text-[#38BDF8]" />
                      <KpiCard label="Comments"  value={n(comments)} />
                      <KpiCard label="Follows"   value={"+" + n(selectedInsight.follows)} sub="Within 24h of watch" color="text-[#34D399]" />
                    </>
                  );
                })()}
              </div>

              {/* Retention curve */}
              {selectedInsight.retentionCurve.length > 0 ? (
                <>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] text-muted2">Audience retention — % still watching at each second through the reel</span>
                    {selectedReel.length && (
                      <span className="text-[10px] text-muted2">{sec2str(selectedReel.length)} total</span>
                    )}
                  </div>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={selectedInsight.retentionCurve.map((p) => ({
                        pos: selectedReel.length
                          ? sec2str((p.positionPct / 100) * selectedReel.length)
                          : p.positionPct.toFixed(0) + "%",
                        retention: p.retentionPct,
                      }))}>
                        <defs>
                          <linearGradient id="gRet" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                        <XAxis dataKey="pos" tick={TICK} interval={Math.max(1, Math.floor(selectedInsight.retentionCurve.length / 12))} />
                        <YAxis tick={TICK} domain={[0, 100]} unit="%" />
                        <Tooltip {...TT} formatter={(v: any) => [typeof v === "number" ? v.toFixed(1) + "%" : v, "Retention"]} />
                        <ReferenceLine y={50} stroke="rgba(200,213,220,.15)" strokeDasharray="4 2" label={{ value: "50%", position: "insideRight", fontSize: 9, fill: "rgba(200,213,220,.3)" }} />
                        <Area type="monotone" dataKey="retention" name="Retention" stroke="#10B981" fill="url(#gRet)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="rounded-card border border-border bg-[#0D1825] px-4 py-4 text-center text-[12px] text-muted2">
                  Retention curve not yet available — reel needs more views for Meta to compute this metric.
                </div>
              )}
            </Card>
          )}

          {/* All-reels overlaid retention */}
          {retentionChartData.length > 0 && reelsWithData.filter((v: VideoMeta) => reelInsights[v.id]?.retentionCurve?.length > 0).length > 1 && (
            <>
              <SectionLabel>Retention Curves — All Reels Overlaid</SectionLabel>
              <Card className="mb-3">
                <p className="mb-2 text-[11px] text-muted2">X-axis = % through the reel. Higher curves = better hold-through. Click legend to isolate.</p>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={retentionChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                      <XAxis dataKey="pos" tick={TICK} />
                      <YAxis tick={TICK} domain={[0, 100]} unit="%" />
                      <Tooltip {...TT} formatter={(v: any, name: string) => {
                        const idx = parseInt(name.replace("v", ""));
                        const vm = reelsWithData.filter((v: VideoMeta) => reelInsights[v.id]?.retentionCurve?.length > 0)[idx] as VideoMeta;
                        const label = vm?.title || vm?.description?.slice(0, 30) || name;
                        return [typeof v === "number" ? v.toFixed(1) + "%" : v, label];
                      }} />
                      <ReferenceLine y={50} stroke="rgba(200,213,220,.12)" strokeDasharray="4 2" />
                      {reelsWithData
                        .filter((v: VideoMeta) => reelInsights[v.id]?.retentionCurve?.length > 0)
                        .slice(0, 8)
                        .map((_: VideoMeta, i: number) => (
                          <Line key={i} type="monotone" dataKey={`v${i}`}
                            stroke={VIDEO_COLORS[i % VIDEO_COLORS.length]}
                            strokeWidth={selectedId === reelsWithData[i]?.id ? 2.5 : 1.5}
                            dot={false}
                            opacity={selectedId && selectedId !== reelsWithData[i]?.id ? 0.35 : 1}
                            strokeDasharray={i > 3 ? "5 3" : undefined} />
                        ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}

          {/* Watch-depth heatmap */}
          <SectionLabel>Watch-Depth Heatmap — Retention at Key Positions</SectionLabel>
          <Card className="mb-3">
            <p className="mb-3 text-[11px] text-muted2">
              % of viewers still watching at 0/10/25/50/75/90/100% through the reel. Normalized by each reel&apos;s length.{" "}
              <span style={{ color: "#10B981" }}>■ ≥75%</span>{" "}
              <span style={{ color: "#FBBF24" }}>■ 35–74%</span>{" "}
              <span style={{ color: "#F87171" }}>■ &lt;35%</span>
            </p>
            <WatchDepthHeatmap videos={videos} insights={reelInsights} />
          </Card>

          {/* Reel leaderboard */}
          <SectionLabel>Reel Leaderboard — All Reels Ranked by Plays</SectionLabel>
          <Card className="mb-3 overflow-x-auto">
            <table className="dt w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Reel</th>
                  <th className="text-right">Plays</th>
                  <th className="text-right">Reach</th>
                  <th className="text-right">Replays</th>
                  <th className="text-right">Reactions</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Avg Watch</th>
                  <th className="text-right">Follows</th>
                </tr>
              </thead>
              <tbody>
                {reelLeaderboard.map((v: VideoMeta, i: number) => {
                  const ins = reelInsights[v.id];
                  const totalRxn = Object.values(ins.reactions).reduce<number>((s, x) => s + Number(x), 0);
                  const shares = ins.socialActions["SHARE"] || 0;
                  const title = v.title || v.description?.slice(0, 50) || "—";
                  return (
                    <tr key={v.id} className={selectedId === v.id ? "bg-[#111B28]" : ""} onClick={() => setSelectedId(v.id)} style={{ cursor: "pointer" }}>
                      <td className="text-muted2">{i + 1}</td>
                      <td className="text-muted2 whitespace-nowrap">{v.created_time.slice(0, 10)}</td>
                      <td className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
                        {v.permalink_url
                          ? <a href={v.permalink_url} target="_blank" rel="noopener noreferrer" className="border-b border-dashed border-accent/40 text-[#C8D5DF] no-underline" onClick={(e) => e.stopPropagation()}>{title}</a>
                          : <span className="text-[#C8D5DF]">{title}</span>}
                      </td>
                      <td className="text-right font-bold text-[#6366F1]">{n(ins.playCount)}</td>
                      <td className="text-right">{n(ins.reach)}</td>
                      <td className="text-right text-[#C084FC]">{n(ins.replayCount)}</td>
                      <td className="text-right">{n(totalRxn)}</td>
                      <td className="text-right text-[#38BDF8]">{n(shares)}</td>
                      <td className="text-right">{ins.avgWatchMs > 0 ? sec2str(ins.avgWatchMs / 1000) : "—"}</td>
                      <td className="text-right text-[#34D399]">{ins.follows > 0 ? "+" + ins.follows : "—"}</td>
                    </tr>
                  );
                })}
                {reelLeaderboard.length === 0 && (
                  <tr><td colSpan={10} className="py-6 text-center text-muted2">
                    {videos.length === 0 ? "No reels found on this Page." : "Loading reel insights…"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — DATA HEALTH
// ══════════════════════════════════════════════════════════════════════════════

function StatusRow({ label, status }: { label: string; status: LoadStatus | null }) {
  return (
    <div className="flex items-start justify-between border-b border-border py-2 last:border-0">
      <span className="text-[12px] text-[#C8D5DF]">{label}</span>
      {!status
        ? <span className="text-[11px] text-muted2">Pending…</span>
        : status.ok
          ? <span className="rounded-full bg-[#052E1C] px-2 py-0.5 text-[11px] font-bold text-[#34D399]">✓ OK</span>
          : <span className="max-w-[60%] text-right text-[11px] text-[#F87171]" title={status.error}>✗ {status.error}</span>
      }
    </div>
  );
}

function HealthSection({ statusVideo, statusEngage, statusAudience, statusViews, statusPosts, statusVideoList, range, totalViews, totalEng, totalFollows, postsCount, videoCount, reelCount }: any) {
  const groups = [
    { label: "Page video metrics — 9 metrics, Group 1",        status: statusVideo },
    { label: "Page engagement metrics — Group 2",              status: statusEngage },
    { label: "Audience follow/unfollow metrics — Group 3",     status: statusAudience },
    { label: "Page views metric — Group 4",                    status: statusViews },
    { label: "Profile fan_count + published posts — Group 5",  status: statusPosts },
    { label: "Reel list + per-reel insights — Group 6",        status: statusVideoList },
  ];
  const okCount   = groups.filter((g) => g.status?.ok).length;
  const failCount = groups.filter((g) => g.status && !g.status.ok).length;

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard label="API Groups OK"    value={`${okCount} / ${groups.length}`} color={okCount === groups.length ? "text-[#34D399]" : "text-[#F87171]"} />
        <KpiCard label="Groups Failed"    value={String(failCount)}               color={failCount > 0 ? "text-[#F87171]" : "text-[#34D399]"} />
        <KpiCard label="API Version"      value="v25.0"                           sub="Graph API" color="text-[#38BDF8]" />
        <KpiCard label="Date Range"       value={range.since.slice(5) + " → " + range.until.slice(5)} />
      </div>

      <SectionLabel>Metric Group Status</SectionLabel>
      <Card className="mb-3">
        {groups.map((g, i) => <StatusRow key={i} label={g.label} status={g.status} />)}
      </Card>

      <SectionLabel>Data Summary</SectionLabel>
      <Card className="mb-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {[
            { label: "Video Views Loaded",   value: n(totalViews) },
            { label: "Post Engagements",      value: n(totalEng) },
            { label: "Posts Loaded",          value: String(postsCount) },
            { label: "Reels Found",           value: String(videoCount) },
            { label: "Reels with Insights",   value: String(reelCount) },
            { label: "New Follows",           value: n(totalFollows) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[10px] font-bold uppercase text-muted2">{label}</div>
              <div className="mt-1 text-lg font-bold text-text">{value}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-3 rounded-card border border-[#38BDF8]/20 bg-[#0C2D3F] px-4 py-3 text-[12px] text-[#38BDF8] leading-relaxed">
        <strong className="text-[#C8D5DF]">Reel metrics used:</strong>{" "}
        <code>blue_reels_play_count</code> (unique plays), <code>fb_reels_total_plays</code> (incl. replays),
        <code>fb_reels_replay_count</code>, <code>post_impressions_unique</code> (reach),
        <code>post_video_avg_time_watched</code>, <code>post_video_view_time</code>,
        <code>post_video_retention_graph</code> (seconds-keyed, fraction values),
        <code>post_video_social_actions</code>, <code>post_video_likes_by_reaction_type</code>,
        <code>post_video_followers</code>.
      </div>

      <div className="rounded-card border border-border bg-card px-4 py-3 text-[12px] text-muted2 leading-relaxed">
        <strong className="text-[#C8D5DF]">Token validity:</strong> Long-lived Page token expires ~mid-September 2026.
        To refresh: exchange a new short-lived user token via Graph API Explorer, then update{" "}
        <code className="rounded bg-[#0D1825] px-1 py-0.5 text-[#38BDF8]">META_PAGE_ACCESS_TOKEN</code>{" "}
        in Vercel environment variables and redeploy.
      </div>
    </div>
  );
}
