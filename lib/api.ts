// lib/api.ts
// Thin client-side fetch helpers for the Next.js API routes. Never calls
// graph.facebook.com directly — always goes through /api/meta or /api/meta-page.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function handle(r: Response) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
  }
  return data;
}

export async function metaAdsGet(params: Record<string, string | undefined>): Promise<any> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) qs.set(k, v);
  });
  const r = await fetch(`/api/meta?${qs.toString()}`, { cache: "no-store" });
  return handle(r);
}

export async function metaPageGet(params: Record<string, string | undefined>): Promise<any> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) qs.set(k, v);
  });
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  let r: Response;
  try {
    r = await fetch(`/api/meta-page?${qs.toString()}`, { cache: "no-store", signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
  return handle(r);
}

/** Follows Graph API cursor pagination via the /api/meta proxy (ad account). */
export async function metaAdsAll(path: string, params: Record<string, string>): Promise<any[]> {
  let rows: any[] = [];
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const data = await metaAdsGet({ path, ...params, ...(after ? { after } : {}) });
    rows = rows.concat(data.data || []);
    after = data.paging?.cursors?.after;
    if (!after || rows.length >= 2000) break;
  }
  return rows;
}

export async function getSessionStatus(): Promise<{
  connected: boolean;
  authenticated: boolean;
  hasAds: boolean;
  hasPage: boolean;
  adAccountId?: string;
  pageId?: string;
}> {
  const r = await fetch("/api/session", { cache: "no-store" });
  return r.json();
}
