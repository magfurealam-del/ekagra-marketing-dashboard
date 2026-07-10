// lib/pageInsights.ts
// Types + parsing helpers specific to the Page Insights tab.

export interface PageInsightValuePoint {
  end_time: string;
  value: number | Record<string, number>;
}

export interface PageInsightMetric {
  name: string;
  period: string;
  values: PageInsightValuePoint[];
}

/** Flattens a page_insights `/insights` response for a single scalar metric into {date, value}[]. */
export function flattenScalarMetric(metric: PageInsightMetric | undefined): { date: string; value: number }[] {
  if (!metric) return [];
  return metric.values.map((v) => ({
    date: v.end_time.slice(0, 10),
    value: typeof v.value === "number" ? v.value : 0,
  }));
}

/** Flattens a breakdown metric (e.g. reactions by type) into {date, ...reactionCounts}[]. */
export function flattenBreakdownMetric(metric: PageInsightMetric | undefined): Record<string, number | string>[] {
  if (!metric) return [];
  return metric.values.map((v) => ({
    date: v.end_time.slice(0, 10),
    ...(typeof v.value === "object" && v.value !== null ? v.value : {}),
  }));
}

export interface TopPost {
  id: string;
  message: string;
  created_time: string;
  permalink_url?: string;
  likes: number;
  comments: number;
  shares: number;
  totalEngagement: number;
}

export function parsePosts(raw: any[]): TopPost[] {
  return raw.map((p) => {
    const likes = p.likes?.summary?.total_count ?? 0;
    const comments = p.comments?.summary?.total_count ?? 0;
    const shares = p.shares?.count ?? 0;
    return {
      id: p.id,
      message: p.message || "(no text — photo/video/link post)",
      created_time: p.created_time || "",
      permalink_url: p.permalink_url,
      likes,
      comments,
      shares,
      totalEngagement: likes + comments + shares,
    };
  });
}
