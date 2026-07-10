"use client";

import { useCallback, useEffect, useState } from "react";
import { metaAdsAll, metaAdsGet } from "@/lib/api";
import { adType, type Campaign, daysAgoStr, todayStr } from "@/lib/metaCalc";

export const INSIGHT_FIELDS =
  "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,reach,frequency,actions,cost_per_result,date_start,date_stop";
export const VIDEO_FIELDS =
  "video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions";

export interface DateRange {
  since: string;
  until: string;
}

export function defaultRange(): DateRange {
  return { since: daysAgoStr(90), until: todayStr() };
}

/** Loads campaign-level insights + campaign metadata for a date range, mirroring fetchCampaigns() in the original dashboard. */
export function useCampaigns(range: DateRange) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, campaignMeta] = await Promise.all([
        metaAdsAll("insights", {
          fields: `${INSIGHT_FIELDS},${VIDEO_FIELDS}`,
          level: "campaign",
          since: range.since,
          until: range.until,
        }),
        metaAdsAll("campaigns", {
          fields: "id,name,effective_status,objective,start_time,stop_time",
        }),
      ]);
      const metaById: Record<string, any> = {};
      campaignMeta.forEach((c) => (metaById[c.id] = c));
      const merged: Campaign[] = rows
        .filter((r) => parseFloat(r.spend || "0") > 0)
        .map((r) => {
          const meta = metaById[r.campaign_id] || {};
          return {
            ...r,
            id: r.campaign_id,
            name: r.campaign_name,
            status: meta.effective_status || "UNKNOWN",
            objective: meta.objective || "",
            startTime: meta.start_time || "",
            stopTime: meta.stop_time || "",
            type: adType(r.campaign_name || ""),
          };
        });
      setCampaigns(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [range.since, range.until]);

  useEffect(() => {
    load();
  }, [load]);

  return { campaigns, loading, error, reload: load };
}

/** Loads monthly time-series insights for the account (Overview charts). */
export function useMonthly(range: DateRange) {
  const [monthly, setMonthly] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    metaAdsGet({
      path: "insights",
      fields: INSIGHT_FIELDS,
      time_increment: "monthly",
      since: range.since,
      until: range.until,
    })
      .then((d) => {
        if (!cancelled) setMonthly(d.data || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load monthly data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.since, range.until]);

  return { monthly, loading, error };
}
