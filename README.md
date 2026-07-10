# Ekagra Health - Marketing Intelligence

A Next.js 14 dashboard for Ekagra Health's marketing team, combining Meta Ads
performance with organic Facebook Page insights in one internal tool.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

For local use, copy `.env.example` to `.env.local` and fill in real values.
Never commit `.env.local`.

## Securing The Dashboard

The browser lock screen asks only for a dashboard password. Meta credentials are
configured as server-side environment variables, so users no longer paste access
tokens into the browser.

Set these variables in Vercel Project Settings -> Environment Variables:

- `SITE_PASSWORD` - password users enter to unlock the dashboard
- `SITE_AUTH_SECRET` - optional long random signing secret for the httpOnly auth cookie
- `META_ADS_ACCESS_TOKEN` - long-lived Meta token from Business Suite -> System Users
- `META_AD_ACCOUNT_ID` - numeric ad account ID, with or without the `act_` prefix
- `META_PAGE_ID` - optional, enables the Page Insights tab
- `META_PAGE_ACCESS_TOKEN` - optional, required alongside `META_PAGE_ID`

Required Meta permissions:

- `ads_read`
- `read_insights`
- `pages_read_engagement` - only needed for Page Insights

Submitting the password to `/api/session` creates a secure httpOnly cookie. The
cookie contains only an HMAC session marker, not Meta credentials. All Graph API
calls happen server-side via `/api/meta` and `/api/meta-page`, so the browser
never talks to `graph.facebook.com` directly and never receives the access
tokens.

Use "Lock dashboard" in the header to clear the site session cookie.

## No Secrets Are Committed

This repository contains no real API keys, tokens, passwords, or account IDs.
`.env.example` documents the required variable names with placeholder values.
Real values should live in Vercel environment variables or a local `.env.local`
file that is not committed.

## Architecture Notes

- `lib/metaCalc.ts` - framework-agnostic calculation helpers ported from the original dashboard.
- `lib/session.ts` - server-only password session and Meta environment credential helper.
- `app/api/session/route.ts` - verifies the dashboard password and manages the site session cookie.
- `app/api/meta/route.ts` - proxies ad-account Graph API calls.
- `app/api/meta-page/route.ts` - proxies Facebook Page Graph API calls.
- `components/tabs/*` - one component per dashboard tab.
- Charts use Recharts.

## Known Gaps

- Boosted-post detection is out of scope for v1.
- Fatigue detection ports the original heuristic: last-7-day average CTR vs prior-7-day average CTR per campaign.
- Audience breakdowns use account-level age/gender breakdowns.
- The organic-vs-paid overlay chart aligns by calendar date and does not model lagged effects.
