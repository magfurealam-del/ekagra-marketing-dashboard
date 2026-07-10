"use client";

import { useState } from "react";

export default function LockScreen({ onConnected }: { onConnected: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (!password.trim()) {
      setError("Enter the dashboard password.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Unable to unlock the dashboard.");
        return;
      }
      if (!data.connected) {
        setError("Unlocked, but Meta credentials are not configured on the server.");
        return;
      }
      onConnected();
    } catch {
      setError("Network error - please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[460px] rounded-[14px] border border-border2 bg-card p-9 px-10">
        <h2 className="mb-1.5 text-lg font-bold text-accent">Ekagra Health · Marketing Intelligence</h2>
        <p className="mb-5 text-[12.5px] leading-relaxed text-muted">
          This dashboard is private. Enter the site password to continue. Meta credentials are
          configured securely on the server and are never entered in the browser.
        </p>

        <div className="mb-3.5 flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted2">
            Dashboard Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full rounded-lg border border-border2 bg-bg px-3 py-2.5 text-[13px] text-text outline-none focus:border-accent"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoComplete="current-password"
            autoFocus
          />
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="mt-1 w-full rounded-lg bg-accentDark py-3 text-sm font-bold text-white hover:bg-[#189068] disabled:opacity-60"
        >
          {loading ? "Unlocking..." : "Unlock dashboard"}
        </button>
        <div className="mt-2 min-h-[16px] text-xs text-danger2">{error}</div>

        <div className="mt-3.5 text-[11px] leading-relaxed text-[#3A5060]">
          Access is controlled by <code className="rounded bg-bg px-1 py-0.5 text-accent">SITE_PASSWORD</code>.
          Meta tokens stay in Vercel environment variables and only server API routes can use them.
        </div>
      </div>
    </div>
  );
}
