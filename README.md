# Ekagra Health — Marketing Intelligence

A Next.js 14 (App Router, TypeScript) dashboard for Ekagra Health's marketing
team, combining Meta Ads performance with organic Facebook Page insights in
one internal tool. This replaces the previous single-file HTML/vanilla-JS
dashboard.

## What it does

- **Overview / Campaigns / Video / Audience / Fatigue / Intelligence** —
  ports of the original dashboard's tabs: spend & conversation trends, a
  sortable campaigns table with CPR/CPC/hook%/completion%, video retention
  funnels, age/gender audience breakdowns, ad-fatigue detection (7-day vs
  prior-7-day CTR comparison, card + heatmap views), and dynamic
  efficiency-grade insight cards (A/B/C/D) computed live from your data — no
  hardcoded campaign names or numbers.
- **Page Insights** (the main new addition) — organic Page performance for
  executives: follower growth headline, 28-day rolling engagement trend,
  reactions breakdown, reach/views with a view-to-follow conversion KPI, an
  organic-engagement-vs-ad-spend overlay chart, a top-10 posts table, and
  automatic anomaly callouts when daily follows/unfollows spike more than 2x
  their trailing 7-day average.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Connecting your Meta account

On first load you'll see a lock screen asking for:

- **Meta Ads Access Token** — a long-lived token from Meta Business Suite →
  System Users → Generate Token
- **Ad Account ID** — numeric ID (with or without the `act_` prefix)
- **Facebook Page ID** (optional) — enables the Page Insights tab
- **Facebook Page Access Token** (optional) — required alongside the Page ID

Required permissions — same as the original dashboard:

- `ads_read`
- `read_insights`
- `pages_read_engagement` (only needed for Page Insights)

Submitting the form POSTs your credentials to `/api/session`, which stores
them in a single **httpOnly, secure, sameSite=lax cookie**. They are never
written to localStorage, never sent back to client-side JavaScript, and
never logged. All Graph API calls happen server-side via `/api/meta` (ad
account) and `/api/meta-page` (Facebook Page) — the browser never talks to
`graph.facebook.com` directly.

Use "⚙ Change credentials" in the header to clear the session cookie and
reconnect with different credentials.

## No secrets are hardcoded or committed

This repository contains no API keys, tokens, or account IDs. `.env.example`
documents that no environment variables are required for basic operation —
all credentials are supplied at runtime through the lock screen and kept
server-side only, in memory of the request/cookie, never on disk.

## Architecture notes

- `lib/metaCalc.ts` — framework-agnostic calculation helpers ported from the
  original dashboard (`getC`, `getCPR`, `getVid`, `getLeads`,
  `isActiveRunning`, `adType`, `fmt`, fatigue classification, anomaly
  detection, etc).
- `lib/session.ts` — server-only cookie read/write for the combined
  credential payload.
- `app/api/session/route.ts` — sets/reads/clears the session cookie.
- `app/api/meta/route.ts` — proxies ad-account Graph API calls.
- `app/api/meta-page/route.ts` — proxies Facebook Page Graph API calls
  (`/insights`, `/posts`, profile fields).
- `components/tabs/*` — one component per dashboard tab; each manages its
  own date range and data fetching via the shared `lib/useCampaigns.ts` hook
  or direct `lib/api.ts` calls.
- Charts use [Recharts](https://recharts.org/).

## Known gaps / v1 limitations

- **Boosted-post detection is out of scope for v1.** All posts in the Page
  Insights "Top posts" table are labeled "Organic" — this does not confirm
  zero ad spend behind a post; cross-referencing boosted post IDs against ad
  creatives is a follow-up.
- Fatigue detection ports the original's exact heuristic: last-7-day average
  CTR vs prior-7-day average CTR per campaign (`classifyFatigue` in
  `lib/metaCalc.ts`), needing at least 14 days of daily data; it is not a
  formal statistical model.
- Audience breakdowns use account-level `age`/`gender` breakdowns; there is
  no campaign-level audience drill-down yet.
- The organic-vs-paid overlay chart aligns by calendar date; it does not
  attempt to model delayed/lagged effects of ad spend on organic engagement.
