"use client";

import { useState } from "react";

export default function LockScreen({ onConnected }: { onConnected: () => void }) {
  const [adToken, setAdToken] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [pageToken, setPageToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (!adToken.trim() || !adAccountId.trim()) {
      setError("Meta Ads access token and Ad Account ID are required.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adToken: adToken.trim(),
          adAccountId: adAccountId.trim(),
          pageId: pageId.trim(),
          pageToken: pageToken.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Failed to connect.");
        return;
      }
      onConnected();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[460px] rounded-[14px] border border-border2 bg-card p-9 px-10">
        <h2 className="mb-1.5 text-lg font-bold text-accent">Ekagra Health · Marketing Intelligence</h2>
        <p className="mb-5 text-[12.5px] leading-relaxed text-muted">
          Connect your Meta credentials to get started. Nothing is stored except in a secure,
          httpOnly cookie in your browser — no secrets are ever written to disk on the server.
        </p>

        <Field label="Meta Ads Access Token">
          <input
            type="password"
            value={adToken}
            onChange={(e) => setAdToken(e.target.value)}
            placeholder="Paste long-lived access token…"
            className="w-full rounded-lg border border-border2 bg-bg px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <Field label="Ad Account ID">
          <input
            type="text"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            placeholder="e.g. 700609876173906"
            className="w-full rounded-lg border border-border2 bg-bg px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <Field label="Facebook Page ID (optional — enables Page Insights tab)">
          <input
            type="text"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            placeholder="Facebook Page ID or username"
            className="w-full rounded-lg border border-border2 bg-bg px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <Field label="Facebook Page Access Token (optional)">
          <input
            type="password"
            value={pageToken}
            onChange={(e) => setPageToken(e.target.value)}
            placeholder="Page token with pages_read_engagement scope"
            className="w-full rounded-lg border border-border2 bg-bg px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>

        <button
          onClick={submit}
          disabled={loading}
          className="mt-1 w-full rounded-lg bg-accentDark py-3 text-sm font-bold text-white hover:bg-[#189068] disabled:opacity-60"
        >
          {loading ? "Connecting…" : "Connect →"}
        </button>
        <div className="mt-2 min-h-[16px] text-xs text-danger2">{error}</div>

        <div className="mt-3.5 text-[11px] leading-relaxed text-[#3A5060]">
          Get a token: Meta Business Suite → System Users → Generate Token
          <br />
          Permissions needed: <code className="rounded bg-bg px-1 py-0.5 text-accent">ads_read</code>,{" "}
          <code className="rounded bg-bg px-1 py-0.5 text-accent">read_insights</code>,{" "}
          <code className="rounded bg-bg px-1 py-0.5 text-accent">pages_read_engagement</code>
          <br />
          Page fields are optional — only needed for the Page Insights tab (follower growth,
          organic engagement, top posts).
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-wider text-muted2">{label}</label>
      {children}
    </div>
  );
}
