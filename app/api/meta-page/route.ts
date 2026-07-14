import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";

const GRAPH = "https://graph.facebook.com/v25.0";

export async function GET(req: NextRequest) {
  const session = readSession();
  if (!session) {
    return NextResponse.json({ error: "Unlock the dashboard and configure Meta credentials on the server." }, { status: 401 });
  }
  if (!session.pageId || !session.pageToken) {
    return NextResponse.json({ error: "Add a Facebook Page ID and Page access token to use Page Insights" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pathOverride = searchParams.get("path");
  const metrics = searchParams.get("metrics");
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const period = searchParams.get("period") || "day";

  let path: string;
  if (!pathOverride) {
    path = `${session.pageId}/insights`;
  } else if (pathOverride === "posts" || pathOverride === "published_posts") {
    path = `${session.pageId}/published_posts`;
  } else if (pathOverride === "profile") {
    path = `${session.pageId}`;
  } else if (pathOverride === "videos") {
    path = `${session.pageId}/videos`;
  } else if (pathOverride.startsWith("video_insights/")) {
    const videoId = pathOverride.replace("video_insights/", "");
    path = `${videoId}/video_insights`;
  } else {
    path = pathOverride;
  }

  const qs = new URLSearchParams();

  // Page-level insights: use the metric/since/until/period params
  if (!pathOverride) {
    if (metrics) qs.set("metric", metrics);
    if (since) qs.set("since", since);
    if (until) qs.set("until", until);
    if (period) qs.set("period", period);
  }

  // Per-video insights: forward metric and period
  if (pathOverride?.startsWith("video_insights/")) {
    if (metrics) qs.set("metric", metrics);
    if (period) qs.set("period", period);
  }

  // Forward any other params not already handled (e.g. fields, limit)
  const handled = new Set(["path", "metrics", "since", "until", "period"]);
  searchParams.forEach((value, key) => {
    if (!handled.has(key)) qs.set(key, value);
  });
  qs.set("access_token", session.pageToken);

  try {
    const r = await fetch(`${GRAPH}/${path}?${qs.toString()}`, { cache: "no-store" });
    const data = await r.json();
    if (data.error) {
      return NextResponse.json(
        { error: data.error.message || "Meta Graph API error", code: data.error.code },
        { status: r.status >= 400 ? r.status : 502 }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to reach Meta Graph API" }, { status: 502 });
  }
}

export const runtime = "nodejs";
