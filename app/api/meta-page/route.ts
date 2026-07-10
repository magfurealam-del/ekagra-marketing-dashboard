import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";

// Proxies Facebook Page level Graph API calls (page_insights, /posts, page
// profile fields). Client components must never call graph.facebook.com
// directly — everything routes through here so the page access token stays
// server-side only.

const GRAPH = "https://graph.facebook.com/v20.0";

export async function GET(req: NextRequest) {
  const session = readSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unlock the dashboard and configure Meta credentials on the server." },
      { status: 401 }
    );
  }
  if (!session.pageId || !session.pageToken) {
    return NextResponse.json(
      { error: "Add a Facebook Page ID and Page access token to use Page Insights" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const pathOverride = searchParams.get("path");
  const metrics = searchParams.get("metrics");
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const period = searchParams.get("period") || "day";

  // "path" accepts either a literal Graph API path, or the shorthand
  // "posts" / "profile" which get expanded to the current session's Page ID
  // (the client never knows the page id directly).
  let path: string;
  if (!pathOverride) {
    path = `${session.pageId}/insights`;
  } else if (pathOverride === "posts") {
    path = `${session.pageId}/posts`;
  } else if (pathOverride === "profile") {
    path = `${session.pageId}`;
  } else {
    path = pathOverride;
  }

  const qs = new URLSearchParams();
  if (!pathOverride) {
    if (metrics) qs.set("metric", metrics);
    if (since) qs.set("since", since);
    if (until) qs.set("until", until);
    if (period) qs.set("period", period);
  }
  // Pass through any other params (fields, limit, etc), skipping ones already handled.
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to reach Meta Graph API" },
      { status: 502 }
    );
  }
}

export const runtime = "nodejs";
