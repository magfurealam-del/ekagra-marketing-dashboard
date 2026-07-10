// lib/session.ts
// Canonical session types + server-only cookie reader/serializer.
// Credentials never touch client-side localStorage or JS after submission —
// they live only in an httpOnly cookie, set by app/api/session/route.ts and
// read here by the Meta proxy API routes.

import { cookies } from "next/headers";

export const SESSION_COOKIE = "ek_session";

export interface EkagraSession {
  adToken: string; // Meta Ads access token (ads_read, read_insights)
  adAccountId: string; // Ad Account ID, without "act_" prefix
  pageId: string; // Facebook Page ID or username (optional)
  pageToken: string; // Page access token with pages_read_engagement (optional)
}

export function readSession(): EkagraSession | null {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<EkagraSession>;
    if (!parsed.adToken || !parsed.adAccountId) return null;
    return {
      adToken: parsed.adToken,
      adAccountId: parsed.adAccountId,
      pageId: parsed.pageId ?? "",
      pageToken: parsed.pageToken ?? "",
    };
  } catch {
    return null;
  }
}

export function serializeSession(s: EkagraSession): string {
  return JSON.stringify(s);
}
