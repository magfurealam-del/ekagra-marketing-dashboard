"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, DateRangePicker, ErrorBanner, KpiBar, SectionLabel, Spinner } from "@/components/ui";
import { metaPageGet, metaAdsGet } from "@/lib/api";
import { defaultRange } from "@/lib/useCampaigns";
import { detectAnomalies, fmt, getC } from "@/lib/metaCalc";
import { flattenBreakdownMetric, flattenScalarMetric, parsePosts, type TopPost } from "@/lib/pageInsights";

const REACTION_KEYS = ["like", "love", "wow", "haha", "sorry", "anger"];
const REACTION_COLORS: Record<string, string> = {
  like: "#5ECBA1",
  love: "#F08080",
  wow: "#EFB060",
  haha: "#78A8E0",
  sorry: "#C090F0",
  anger: "#E24B4A",
};

export default function PageInsightsTab({ hasPage }: { hasPage: boolean }) {
  const [range, setRange] = useState(defaultRange());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [fans, setFans] = useState<{ date: string; value: number }[]>([]);
  const [follows, setFollows] = useState<{ date: string; value: number }[]>([]);
  const [unfollows, setUnfollows] = useState<{ date: string; value: number }[]>([]);
  const [engagement, setEngagement] = useState<{ date: string; value: number }[]>([]);
  const [reactions, setReactions] = useState<Record<string, number | string>[]>([]);
  const [pageViews, setPageViews] = useState<{ date: string; value: number }[]>([]);
  const [videoViews, setVideoViews] = useState<{ date: string; value: number }[]>([]);
  const [adSpendSeries, setAdSpendSeries] = useState<{ date: string; spend: number }[]>([]);
  const [posts, setPosts] = useState<TopPost[]>([]);

  useEffect(() => {
    if (!hasPage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");

    const metrics = [
      "page_fans",
      "page_daily_follows_unique",
      "page_daily_unfollows_unique",
      "page_post_engagements",
      "page_actions_post_reactions_total",
      "page_views_total",
      "page_video_views",
    ].join(",");

    (async () => {
      try {
        const insightsData = await metaPageGet({
          metrics,
          since: range.since,
          until: range.until,
          period: "day",
        });
        if (cancelled) return;
        const byName: Record<string, any> = {};
        (insightsData.data || []).forEach((m: any) => (byName[m.name] = m));

        setFans(flattenScalarMetric(byName["page_fans"]));
        setFollows(flattenScalarMetric(byName["page_daily_follows_unique"]));
        setUnfollows(flattenScalarMetric(byName["page_daily_unfollows_unique"]));
        setEngagement(flattenScalarMetric(byName["page_post_engagements"]));
        setReactions(flattenBreakdownMetric(byName["page_actions_post_reactions_total"]));
        setPageViews(flattenScalarMetric(byName["page_views_total"]));
        setVideoViews(flattenScalarMetric(byName["page_video_views"]));

        const postsData = await metaPageGet({
          path: "posts",
          fields: "message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true)",
          limit: "50",
        }).catch(() => ({ data: [] }));
        if (!cancelled) setPosts(parsePosts(postsData.data || []));

        const adRows = await metaAdsGet({
          path: "insights",
          fields: "spend,date_start,date_stop",
          since: range.since,
          until: range.until,
          time_increment: "1",
          level: "account",
        }).catch(() => ({ data: [] }));
        if (!cancelled) {
          setAdSpendSeries((adRows.data || []).map((r: any) => ({ date: r.date_start, spend: +r.spend || 0 })));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load Page Insights");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasPage, range.since, range.until]);

  const totalFollowers = fans.length ? fans[fans.length - 1].value : null;
  const netFollows = follows.reduce((s, f) => s + f.value, 0) - unfollows.reduce((s, u) => s + u.value, 0);
  const trend7 = trendArrow(follows.slice(-7), unfollows.slice(-7));
  const trend28 = trendArrow(follows.slice(-28), unfollows.slice(-28));

  const engagementChart = engagement.map((e) => ({ date: e.date.slice(5), engagement: e.value }));
  const reactionChart = reactions.map((r) => ({
    date: String(r.date).slice(5),
    ...REACTION_KEYS.reduce((acc, k) => ({ ...acc, [k]: Number(r[k] || 0) }), {}),
  }));

  const reachChart = pageViews.map((v, i) => ({
    date: v.date.slice(5),
    views: v.value,
    videoViews: videoViews[i]?.value ?? 0,
  }));
  const viewsDelta = pageViews.length ? pageViews[pageViews.length - 1].value - pageViews[0].value : 0;
  const viewToFollowConv = viewsDelta > 0 ? (netFollows / viewsDelta) * 100 : null;

  const overlayChart = useMemo(() => {
    const spendByDate: Record<string, number> = {};
    adSpendSeries.forEach((r) => (spendByDate[r.date] = r.spend));
    return engagement.map((e) => ({ date: e.date.slice(5), organic: e.value, spend: spendByDate[e.date] ?? 0 }));
  }, [engagement, adSpendSeries]);

  const topPosts = [...posts].sort((a, b) => b.totalEngagement - a.totalEngagement).slice(0, 10);

  const followAnomalies = detectAnomalies(follows.map((f) => f.value));
  const unfollowAnomalies = detectAnomalies(unfollows.map((u) => u.value));

  if (!hasPage) {
    return (
      <Card>
        <p className="text-[12px] leading-relaxed text-muted">
          Add a Facebook Page ID and Page Access Token (with{" "}
          <code className="rounded bg-bg px-1 py-0.5 text-accent">pages_read_engagement</code> permission) via
          &quot;⚙ Change credentials&quot; to unlock Page Insights — follower growth, organic engagement trends, and
          top posts.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <DateRangePicker since={range.since} until={range.until} onChange={(since, until) => setRange({ since, until })} />
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <Spinner label="Loading Page Insights…" />
      ) : (
        <>
          {/* 1. Growth headline */}
          <KpiBar
            items={[
              { label: "Total followers", value: totalFollowers != null ? fmt(totalFollowers, "big") : "—" },
              { label: "Net follower growth", value: (netFollows >= 0 ? "+" : "") + fmt(netFollows, "big"), sub: "Follows − unfollows, this range" },
              { label: "7-day trend", value: trend7.label, trend: trend7.trend, sub: "Net follows, last 7 days" },
              { label: "28-day trend", value: trend28.label, trend: trend28.trend, sub: "Net follows, last 28 days" },
            ]}
          />

          {/* 2. Engagement trend */}
          <SectionLabel>Engagement trend</SectionLabel>
          <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card title="Post engagements (28-day rolling)">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={engagementChart}>
                    <defs>
                      <linearGradient id="engFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5ECBA1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#5ECBA1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} />
                    <Area type="monotone" dataKey="engagement" stroke="#5ECBA1" fill="url(#engFill)" strokeWidth={2} name="Engagements (28d)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Reactions by type">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={reactionChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {REACTION_KEYS.map((k) => (
                      <Bar key={k} dataKey={k} stackId="reactions" fill={REACTION_COLORS[k]} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* 3. Reach & views */}
          <SectionLabel>Reach & views</SectionLabel>
          <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
            <Card title="Page views & video views (28-day rolling)">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={reachChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                    <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="left" type="monotone" dataKey="views" name="Page views" stroke="#78A8E0" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="videoViews" name="Video views" stroke="#C090F0" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="View-to-follow conversion">
              <div className="flex h-[220px] flex-col items-center justify-center text-center">
                <div className="text-4xl font-bold text-accent">
                  {viewToFollowConv != null ? `${viewToFollowConv.toFixed(2)}%` : "—"}
                </div>
                <div className="mt-2 max-w-[220px] text-[11px] leading-relaxed text-muted2">
                  Net new follows ÷ page views delta over the selected range.
                </div>
              </div>
            </Card>
          </div>

          {/* 4. Organic vs paid overlay */}
          <SectionLabel>Organic engagement vs ad spend</SectionLabel>
          <Card className="mb-3">
            <p className="mb-2.5 text-[11px] text-muted2">
              Overlays organic post engagement against daily ad spend on the same date axis. Useful for spotting
              whether paid campaigns are also lifting organic activity (or whether organic is flat regardless of
              spend).
            </p>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={overlayChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "rgba(200,213,220,.4)" }} />
                  <Tooltip contentStyle={{ background: "#1A2535", border: "1px solid #2A3A4A", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="right" dataKey="spend" name="Ad spend ($)" fill="rgba(94,203,161,.35)" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="left" type="monotone" dataKey="organic" name="Organic engagement" stroke="#EFB060" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* 5. Top posts table */}
          <SectionLabel>Top posts (last 50, top 10 by engagement)</SectionLabel>
          <Card className="mb-3 overflow-x-auto">
            <table className="dt w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Post</th>
                  <th
                    title="Boosted-post detection is out of scope for v1 — all posts are labeled Organic even if later boosted."
                  >
                    Type
                  </th>
                  <th className="text-right">Likes</th>
                  <th className="text-right">Comments</th>
                  <th className="text-right">Shares</th>
                  <th className="text-right">Total engagement</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.created_time.slice(0, 10)}</td>
                    <td className="max-w-[280px] overflow-hidden text-ellipsis" title={p.message}>
                      {p.permalink_url ? (
                        <a
                          href={p.permalink_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border-b border-dashed border-accent/40 text-[#C8D5DF] no-underline"
                        >
                          {p.message.slice(0, 70)}
                        </a>
                      ) : (
                        p.message.slice(0, 70)
                      )}
                    </td>
                    <td>
                      <span
                        className="pill p-a"
                        title="Boosted-post detection is out of scope for v1 — this label does not confirm zero ad spend."
                      >
                        Organic
                      </span>
                    </td>
                    <td className="text-right">{p.likes}</td>
                    <td className="text-right">{p.comments}</td>
                    <td className="text-right">{p.shares}</td>
                    <td className="text-right font-bold text-text">{p.totalEngagement}</td>
                  </tr>
                ))}
                {topPosts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-5 text-center text-muted2">
                      No posts found for this Page.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          {/* 6. Anomaly callouts */}
          <SectionLabel>Anomaly callouts</SectionLabel>
          <div className="flex flex-col gap-2.5">
            {followAnomalies.map((a) => (
              <div key={`f${a.index}`} className="rounded-card border border-warn/30 bg-warn/10 p-3 px-4 text-[12.5px] text-warn">
                {follows[a.index]?.date}: New follows spiked to {a.value.toLocaleString()} vs 7-day avg of ~
                {Math.round(a.avg).toLocaleString()} ({a.ratio.toFixed(1)}× average) — investigate source.
              </div>
            ))}
            {unfollowAnomalies.map((a) => (
              <div key={`u${a.index}`} className="rounded-card border border-danger/30 bg-danger/10 p-3 px-4 text-[12.5px] text-danger2">
                {unfollows[a.index]?.date}: Unfollows spiked to {a.value.toLocaleString()} vs 7-day avg of ~
                {Math.round(a.avg).toLocaleString()} ({a.ratio.toFixed(1)}× average) — investigate cause.
              </div>
            ))}
            {followAnomalies.length === 0 && unfollowAnomalies.length === 0 && (
              <p className="text-[12.5px] text-muted2">No follow/unfollow anomalies detected in this range.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function trendArrow(follows: { value: number }[], unfollows: { value: number }[]): { label: string; trend: "up" | "down" } {
  const net = follows.reduce((s, f) => s + f.value, 0) - unfollows.reduce((s, u) => s + u.value, 0);
  return { label: `${net >= 0 ? "+" : ""}${net.toLocaleString()}`, trend: net >= 0 ? "up" : "down" };
}
