// lib/session.ts
// Site auth + server-only Meta credential helpers.
// Meta credentials are loaded from environment variables and never sent to the
// browser. The browser only receives an httpOnly cookie proving the dashboard
// password was accepted.

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ek_session";

export interface EkagraSession {
  adToken: string;
  adAccountId: string;
  pageId: string;
  pageToken: string;
}

function authSecret() {
  return process.env.SITE_AUTH_SECRET || process.env.SITE_PASSWORD || "";
}

function authCookieValue() {
  const secret = authSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update("ekagra-dashboard").digest("hex");
}

export function hasSitePasswordConfigured() {
  return Boolean(process.env.SITE_PASSWORD);
}

export function hasValidSiteSession() {
  const expected = authCookieValue();
  const actual = cookies().get(SESSION_COOKIE)?.value || "";
  if (!expected || !actual) return false;
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifySitePassword(password: string) {
  const expected = process.env.SITE_PASSWORD || "";
  if (!expected || !password) return false;
  try {
    return timingSafeEqual(Buffer.from(password), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function serializeSiteSession() {
  return authCookieValue();
}

export function readSession(): EkagraSession | null {
  if (!hasValidSiteSession()) return null;

  const adToken = process.env.META_ADS_ACCESS_TOKEN?.trim() || "";
  const adAccountId = (process.env.META_AD_ACCOUNT_ID || "").trim().replace(/^act_/, "");
  if (!adToken || !adAccountId) return null;

  return {
    adToken,
    adAccountId,
    pageId: process.env.META_PAGE_ID?.trim() || "",
    pageToken: process.env.META_PAGE_ACCESS_TOKEN?.trim() || "",
  };
}

export function getCredentialStatus() {
  return {
    hasAds: Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID),
    hasPage: Boolean(process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN),
    adAccountId: (process.env.META_AD_ACCOUNT_ID || "").trim().replace(/^act_/, ""),
    pageId: process.env.META_PAGE_ID?.trim() || "",
  };
}
