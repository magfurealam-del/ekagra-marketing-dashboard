import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";

// Proxies ad-account level Graph API calls (insights, campaigns, deep-dive
// per-campaign daily insights, etc). Client components must never call
// graph.facebook.com directly — everything routes through here so the ads
// access token stays server-side only.

const GRAPH = "https://graph.facebook.com/v20.0";

export async function GET(req: NextRequest) {
  const session = readSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unlock the dashboard and configure Meta credentials on the server." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get("path") || "insights";
  // Account-relative shorthand (no slash) is prefixed with act_<id>/.
  // Full paths (e.g. "<campaign_id>/insights" for deep-dives) are used as-is.
  const path = rawPath.includes("/") ? rawPath : `act_${session.adAccountId}/${rawPath}`;

  const since = searchParams.get("since");
  const until = searchParams.get("until");

  const qs = new URLSearchParams();
  searchParams.forEach((value, key) => {
    if (key === "path" || key === "since" || key === "until") return;
    qs.set(key, value);
  });
  if (since && until && !qs.has("time_range")) {
    qs.set("time_range", JSON.stringify({ since, until }));
  }
  if (!qs.has("limit")) qs.set("limit", "500");
  qs.set("access_token", session.adToken);

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
